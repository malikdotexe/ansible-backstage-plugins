/*
 * Copyright 2026 The Ansible plugin Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Config } from '@backstage/config';
import { InputError } from '@backstage/errors';

import type { CatalogModuleSlice } from './sliceGuard';

export const CATALOG_PROVIDERS_RHAAP = 'catalog.providers.rhaap';
export const CATALOG_PROVIDERS_AAP = 'catalog.providers.aap';
export const CATALOG_PROVIDERS_CONTENT = 'catalog.providers.content';

const catalogProvidersRootStorage = new AsyncLocalStorage<string>();

export function catalogProvidersConfigRootForSlice(
  slice: CatalogModuleSlice,
): string {
  switch (slice) {
    case 'aap':
      return CATALOG_PROVIDERS_AAP;
    case 'content':
    case 'ee':
      return CATALOG_PROVIDERS_CONTENT;
    case 'all':
    default:
      return CATALOG_PROVIDERS_RHAAP;
  }
}

export function runWithCatalogProvidersConfigRoot<T>(
  providersRoot: string,
  fn: () => T,
): T {
  return catalogProvidersRootStorage.run(providersRoot, fn);
}

export function getCatalogProvidersConfigRoot(): string {
  return catalogProvidersRootStorage.getStore() ?? CATALOG_PROVIDERS_RHAAP;
}

function envPublishesAapIdentity(env: Config): boolean {
  return (
    env.has('multiOrgEnabled') ||
    env.has('orgs') ||
    env.has('sync.orgsUsersTeams')
  );
}

function identityEnvs(root: Config): Config[] {
  return root
    .keys()
    .filter(key => envPublishesAapIdentity(root.getConfig(key)))
    .map(key => root.getConfig(key));
}

function effectiveMultiOrg(envs: Config[]): boolean {
  return envs.some(env => env.getOptionalBoolean('multiOrgEnabled') === true);
}

/**
 * True when legacy `catalog.providers.rhaap` publishes AAP users.
 * Git-only or job-template-only entries do not.
 */
export function legacyRootPublishesAapIdentity(config: Config): boolean {
  const rhaap = config.getOptionalConfig(CATALOG_PROVIDERS_RHAAP);
  if (!rhaap) {
    return false;
  }
  return identityEnvs(rhaap).length > 0;
}

/**
 * Sign-in, provisioning, membership, and catalog sync must share one identity
 * mode. Compare every identity-publishing environment, including different
 * keys. Content-only legacy entries are ignored. A single root is unchanged.
 */
export function assertNoConflictingAapIdentityMode(config: Config): void {
  const aap = config.getOptionalConfig(CATALOG_PROVIDERS_AAP);
  const rhaap = config.getOptionalConfig(CATALOG_PROVIDERS_RHAAP);
  if (!aap || !rhaap) {
    return;
  }
  const aapEnvs = identityEnvs(aap);
  const rhaapEnvs = identityEnvs(rhaap);
  if (aapEnvs.length === 0 || rhaapEnvs.length === 0) {
    return;
  }
  const aapMode = effectiveMultiOrg(aapEnvs);
  const rhaapMode = effectiveMultiOrg(rhaapEnvs);
  if (aapMode !== rhaapMode) {
    throw new InputError(
      `catalog.providers.aap multiOrgEnabled (${aapMode}) disagrees with catalog.providers.rhaap multiOrgEnabled (${rhaapMode}). Catalog sync, sign-in, provisioning, and membership must use the same identity mode.`,
    );
  }
}

export function resolveCatalogProvidersConfig(
  config: Config,
  primaryRoot: string,
): Config | undefined {
  assertNoConflictingAapIdentityMode(config);
  const primaryConfig = config.getOptionalConfig(primaryRoot);
  if (primaryConfig) {
    return primaryConfig;
  }
  if (primaryRoot !== CATALOG_PROVIDERS_RHAAP) {
    return config.getOptionalConfig(CATALOG_PROVIDERS_RHAAP);
  }
  return undefined;
}

/**
 * Resolves catalog provider env config for the active module slice.
 * Split modules fall back to legacy `catalog.providers.rhaap` when their key is unset.
 */
export function getResolvedCatalogProvidersConfig(
  config: Config,
): Config | undefined {
  return resolveCatalogProvidersConfig(config, getCatalogProvidersConfigRoot());
}

/**
 * AAP identity/auth/membership config is not slice-ALS-scoped.
 * Prefer `catalog.providers.aap`, then legacy `catalog.providers.rhaap`.
 */
export function getResolvedAapProvidersConfig(
  config: Config,
): Config | undefined {
  return resolveCatalogProvidersConfig(config, CATALOG_PROVIDERS_AAP);
}

export function isAapMultiOrgEnabled(config?: Config): boolean {
  if (!config) {
    return false;
  }
  const providers = getResolvedAapProvidersConfig(config);
  return (
    providers
      ?.keys()
      .some(
        key =>
          providers.getConfig(key).getOptionalBoolean('multiOrgEnabled') ===
          true,
      ) ?? false
  );
}

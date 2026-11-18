/**
 * @jest-environment node
 */
import { ConfigReader } from '@backstage/config';

import {
  CATALOG_PROVIDERS_AAP,
  CATALOG_PROVIDERS_CONTENT,
  CATALOG_PROVIDERS_RHAAP,
  catalogProvidersConfigRootForSlice,
  getCatalogProvidersConfigRoot,
  getResolvedAapProvidersConfig,
  getResolvedCatalogProvidersConfig,
  isAapMultiOrgEnabled,
  legacyRootPublishesAapIdentity,
  runWithCatalogProvidersConfigRoot,
} from './catalogProviderConfig';
import { readAapApiEntityConfigs } from './providers/config';

describe('catalogProviderConfig', () => {
  it('maps slices to provider config roots', () => {
    expect(catalogProvidersConfigRootForSlice('all')).toBe(
      CATALOG_PROVIDERS_RHAAP,
    );
    expect(catalogProvidersConfigRootForSlice('aap')).toBe(
      CATALOG_PROVIDERS_AAP,
    );
    expect(catalogProvidersConfigRootForSlice('content')).toBe(
      CATALOG_PROVIDERS_CONTENT,
    );
  });

  it('reads split aap config with legacy rhaap fallback', () => {
    const config = new ConfigReader({
      ansible: {
        rhaap: {
          baseUrl: 'https://aap.example.com',
          token: 't',
          checkSSL: true,
        },
      },
      catalog: {
        providers: {
          rhaap: {
            production: {
              orgs: 'LegacyOrg',
              sync: {
                orgsUsersTeams: {
                  schedule: {
                    frequency: { minutes: 30 },
                    timeout: { minutes: 3 },
                  },
                },
              },
            },
          },
        },
      },
    });

    runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_AAP, () => {
      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs).toHaveLength(1);
      expect(configs[0].organizations).toEqual(['legacyorg']);
    });
  });

  it('prefers primary key over legacy when both are set', () => {
    const config = new ConfigReader({
      ansible: {
        rhaap: {
          baseUrl: 'https://aap.example.com',
          token: 't',
          checkSSL: true,
        },
      },
      catalog: {
        providers: {
          aap: {
            production: {
              orgs: 'SplitOrg',
              sync: {
                orgsUsersTeams: {
                  schedule: {
                    frequency: { minutes: 30 },
                    timeout: { minutes: 3 },
                  },
                },
              },
            },
          },
          rhaap: {
            production: { orgs: 'LegacyOrg', multiOrgEnabled: false },
          },
        },
      },
    });

    runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_AAP, () => {
      const configs = readAapApiEntityConfigs(config, 'orgsUsersTeams');
      expect(configs[0].organizations).toEqual(['splitorg']);
    });
  });

  it('resolves content root with rhaap fallback', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          rhaap: {
            production: { orgs: 'x' },
          },
        },
      },
    });

    runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_CONTENT, () => {
      expect(getResolvedCatalogProvidersConfig(config)?.keys()).toEqual([
        'production',
      ]);
    });
  });

  it('keeps the provider root across an async callback', async () => {
    await runWithCatalogProvidersConfigRoot(CATALOG_PROVIDERS_AAP, async () => {
      await Promise.resolve();
      expect(getCatalogProvidersConfigRoot()).toBe(CATALOG_PROVIDERS_AAP);
    });
  });

  it('resolves AAP identity config from catalog.providers.aap without a legacy copy', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          aap: {
            development: { multiOrgEnabled: true, orgs: ['Engineering'] },
          },
        },
      },
    });

    expect(getResolvedAapProvidersConfig(config)?.keys()).toEqual([
      'development',
    ]);
    expect(isAapMultiOrgEnabled(config)).toBe(true);
  });

  it('rejects roots that disagree on multiOrgEnabled for the same environment', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          aap: { development: { multiOrgEnabled: true } },
          rhaap: { development: { multiOrgEnabled: false } },
        },
      },
    });

    expect(() => getResolvedAapProvidersConfig(config)).toThrow(
      'catalog.providers.aap multiOrgEnabled (true)',
    );
    expect(() => getResolvedCatalogProvidersConfig(config)).toThrow(
      'catalog.providers.rhaap multiOrgEnabled (false)',
    );
  });

  it('rejects identity modes that differ across environment keys', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          aap: { development: { multiOrgEnabled: true, orgs: ['Platform'] } },
          rhaap: {
            production: {
              multiOrgEnabled: false,
              orgs: ['Default'],
              sync: {
                orgsUsersTeams: {
                  schedule: {
                    frequency: { minutes: 30 },
                    timeout: { minutes: 3 },
                  },
                },
              },
            },
          },
        },
      },
    });

    expect(legacyRootPublishesAapIdentity(config)).toBe(true);
    expect(() => getResolvedAapProvidersConfig(config)).toThrow(
      'must use the same identity mode',
    );
  });

  it('ignores content-only legacy config when validating AAP identity mode', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          aap: { production: { multiOrgEnabled: true, orgs: ['Platform'] } },
          rhaap: {
            production: {
              sync: { ansibleGitContents: { enabled: true } },
            },
          },
        },
      },
    });

    expect(legacyRootPublishesAapIdentity(config)).toBe(false);
    expect(getResolvedAapProvidersConfig(config)?.keys()).toEqual([
      'production',
    ]);
    expect(isAapMultiOrgEnabled(config)).toBe(true);
  });

  it('falls back to legacy rhaap for AAP identity when aap is unset', () => {
    const config = new ConfigReader({
      catalog: {
        providers: {
          rhaap: {
            development: { multiOrgEnabled: true },
          },
        },
      },
    });

    expect(isAapMultiOrgEnabled(config)).toBe(true);
  });
});

import * as backend from '@ansible/aap-backend';
import * as node from '@ansible/aap-node';
import * as legacyClient from './AAPClient';
import * as legacyService from './AAPService';

it('forwards the existing client, fixtures and configuration exports without duplicating them', () => {
  for (const key of [
    'AAPClient',
    'mockJobTemplateResponse',
    'mockSurveyResponse',
    'getAnsibleConfig',
    'getCatalogConfig',
    'resolveActiveOrganizations',
    'findMissingConfiguredOrganizations',
  ] as const) {
    expect(legacyClient[key]).toBe(node[key]);
  }
});

it('keeps the legacy factory and reference identical to their new owners', () => {
  expect(legacyService.ansibleServiceFactory).toBe(
    backend.ansibleServiceFactory,
  );
  expect(legacyService.ansibleServiceRef).toBe(node.ansibleServiceRef);
  expect(backend.default).toBe(backend.ansibleServiceFactory);
});

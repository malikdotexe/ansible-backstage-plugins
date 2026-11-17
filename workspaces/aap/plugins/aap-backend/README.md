# @ansible/aap-backend

Backstage service factory registration for AAP. The reusable `AAPClient`,
configuration readers, organization/job/PAH helpers and service contracts live
in `@ansible/aap-node`. Shared types, constants and permissions live in
`@ansible/aap-common`.

## Exports

- `ansibleServiceFactory`, also exported as the default backend feature.

The factory creates the existing node-library client with backend configuration
and a plugin-scoped logger. The service ID remains `rhaap.client.service`, with
plugin scope and no reference default factory. Ordinary backend consumers
request `ansibleServiceRef` from `@ansible/aap-node`.

## Registration during extraction

The catalog loader still supplies the factory through the legacy compatibility
export at this stage. The next change transfers installation responsibility to
an explicit `backend.add(import('@ansible/aap-backend'))` registration and
includes source and dynamic migration instructions.

## Compatibility and packaging

The legacy common package forwards client/configuration exports to `aap-node`
and the existing factory export to this package. Artifacts embedding that
compatibility barrel may therefore still need this package in their temporary
dependency closure. Reusable client/helper consumers should import `aap-node`
directly. Embedding a package does not install its service factory.

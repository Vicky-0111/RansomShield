# Copyright & Attribution

## Visible Attribution
"Project By Madhav Harish and Team"

## Copyright Notice
"Copyright © 2026 Madhav Harish and Team. All rights reserved, subject to applicable third-party licenses."

## Centralised Attribution System
The attribution and copyright text are stored in a separate configuration file:
- `src/config/copyright.config.json`

A reusable component renders the notice on every application route:
- `src/components/CopyrightNotice.tsx`

The component is integrated into the shared layout (`src/main.jsx`) and styled to match the dark navy dashboard theme (`src/styles.css`).

## Third-party License Considerations
This simulation preview uses third-party dependencies as declared in `package.json`. Refer to each dependency's license in `node_modules` or the upstream project for details. No original RansomShield private backend, trained model, or dataset was imported or copied.

## Simulation Disclosure
This project is an interactive simulation using synthetic data. It does **not** perform live ransomware detection. No real ransomware is executed or monitored. Scores, events, endpoints, and responses are illustrative synthetic data.

## Limitations of Frontend Protection
- The configuration and component are part of the frontend source and **can be modified by anyone with access to the files**. 
- No password-authenticated editing is implemented in this frontend.
- **Authorised edits must be made through the owner's private repository and enforced by local file permissions.** There are no fake security checks or dummy security modules in this codebase.

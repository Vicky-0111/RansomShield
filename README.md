<img width="1917" height="866" alt="Screenshot 2026-11-21 151209" src="https://github.com/user-attachments/assets/c2538bb6-b57e-4176-baa4-caf821073ad7" />


<img width="1917" height="863" alt="Screenshot 2026-11-21 151321" src="https://github.com/user-attachments/assets/b6bf26be-de86-44b1-8218-81d6bf39a9b3" />


# RansomShield — Simulation Preview

This is a **browser-only UI demonstration** based on the RansomShield dashboard layout. It uses generated synthetic events and a mock API adapter in `src/api.js`.

## Important limitations

- This preview does not include the original FastAPI backend, trained model, dataset, or live monitoring implementation.
- No actual ransomware is executed or detected.
- No real endpoint is monitored, contained, or isolated.
- Scores, events, endpoint status, and response states are illustrative synthetic data.
- This is a simulated UI preview using synthetic data; no live ransomware detection is performed.

## Run locally

Requirements: Node.js and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To create a static build, run `npm run build`.

## Contents

- `src/main.jsx` — dashboard UI
- `src/styles.css` — dashboard styling plus simulation disclosure banner
- `src/api.js` — local synthetic data generator and demo-only interactions
- `package.json` / `package-lock.json` — frontend dependency manifests
- `index.html` — page entry point

This package is intended only as a limited UI preview. It is not the complete RansomShield project.

Copyright Trademark : This Project is by Vicky Kumar
=======
# RansomShield
Behavior-Based Ransomware Detection Platform
>>>>>>> a4c67b49ac763ef4c2ea21ef29673727b3fc046b

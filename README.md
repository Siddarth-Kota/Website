# Siddarth Kota — Portfolio

Live website: https://siddarth-kota.vercel.app

A static computer engineering portfolio. The homepage fits one screen and resembles a chip through its central name block, pins, and traces. Clicking a section sends a blue signal through its trace before opening a separate content page. The site uses black and white with small blue accents and has no project images.

## Where to edit

- `index.html`: homepage name, tagline, and chip navigation links.
- `style.css`: black/white/blue palette, chip layout, typography, responsive rules, and content-page styles.
- `app.js`: trace geometry, ambient data signals, click animation, pause control, and email copy behavior.
- `work.html`: project list and the upcoming Discovery Project entry.
- `projects/riscv.html`, `projects/audio.html`, `projects/sensor.html`: detailed project explanations.
- `about.html`, `experience.html`, `roadmap.html`: biography, work/research experience, and career goals.
- `resume.html`: links to view and download the original resume.
- `contact.html`: email, LinkedIn, and GitHub links.
- `assets/`: original resume PDF, local fonts, their licenses, and favicon.
- `vercel.json`: Vercel clean-URL settings.

## Run locally

There is no dependency installation or build step. Open `index.html` directly, or serve this directory:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Deployment

The files in this repository are the complete static site. Vercel uses the repository root, framework `Other`, and no build command. The site can also be hosted by any static host. Publishing source to GitHub and deploying to Vercel are separate operations until the project is linked to this repository through Vercel's Git settings.

## Accessibility and motion

Section links are real URLs and remain usable without JavaScript. Keyboard focus is visible. Motion can be paused, follows reduced-motion preferences, and stops in hidden tabs. Ctrl/Cmd-click retains the browser's normal new-tab behavior.

## Content still to complete

The ECE Discovery Project has not been identified. Its feature is currently marked as upcoming. Before the Discovery Showcase, add the actual project, at least 400 words describing its process and results, and a project photo/video created by Siddarth. The current image-free design follows the requested revision; the original assignment's five-visual requirement will need to be reconciled before submission.

## Verification

Internal URLs, assets, unique IDs, page headings, and JavaScript syntax were checked. A simulated DOM check covers trace construction, pulse-before-navigation, destinations, modifier keys, pause/resume, reduced motion, hidden tabs, and back-navigation reset. Browser visual QA was unavailable because the managed browser-control tool was absent.

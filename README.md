# Siddarth Kota — Portfolio

Live website: https://siddarth-kota.vercel.app

A static computer engineering portfolio. The homepage fits one screen and resembles a chip through its central name block, pins, and traces. Clicking a section sends a blue signal through its trace before opening a separate content page. The site uses black and white with small blue accents. Technical images appear on the project detail pages.

## Where to edit

- `index.html`: homepage name, six chip navigation links, and the quick introduction beneath the chip. Edit the paragraph with `id="personal-bio"` for the introduction.
- `style.css`: black/white/blue palette, chip layout, typography, responsive rules, and content-page styles.
- `app.js`: responsive navigation traces, two pin-connected traces framing the introduction, ambient data signals, pulse-before-navigation, destination prefetching, and navigation fallbacks.
- `work.html`: project list, with each LINK opening its detailed project explanation.
- `projects/riscv.html`, `projects/audio.html`, `projects/sensor.html`: detailed project explanations.
- Project images use a shared `.project-figure` immediately after the project facts and before the write-up, with captions, alt text, and full-size links. The images are `assets/riscv-schematic.png` (CPU schematic), `assets/audio-spectrum.png` (DSP test setup), and `assets/lab-sensor.png` (ESP32 PCB render). Keep image `width` and `height` attributes in sync with replacement files so the browser reserves the correct space.
- `about.html`, `experience.html`, `roadmap.html`: biography, work/research experience, and career goals.
- `roadmap.html`: a simple Career goals heading and paragraph; the existing URL is retained.
- `resume.html`: an embedded copy of the original resume and a download button, both using the PDF already hosted on the live site.
- `contact.html`: email, LinkedIn, and GitHub links.
- `assets/`: local fonts, their licenses, favicon, and project images. The original resume PDF stays on the live website and is linked from `resume.html`; it is excluded from this public repository.
- `vercel.json`: Vercel clean-URL settings.

## Run locally

There is no dependency installation or build step. Open `index.html` directly, or serve this directory:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Deployment

The files in this repository are the static site source. The resume PDF is served separately at the URL in `resume.html`. Vercel uses the repository root, framework `Other`, and no build command. The site can also be hosted by any static host. Publishing source to GitHub and deploying to Vercel are separate operations until the project is linked to this repository through Vercel's Git settings.

## Accessibility and motion

Section links are real URLs and remain usable without JavaScript. Keyboard focus is visible. Ambient signals follow reduced-motion preferences and stop in hidden tabs. Over HTTP, internal navigation fetches the destination HTML and swaps the page body without reloading the document. The current page stays visible while the destination loads. View Transitions animate the swap with a crossfade and slight vertical movement; Web Animations provide a fallback. The shared header, navigation, and footer transition independently. Destination HTML is prefetched on hover, keyboard focus, and pulse activation. Direct navigation remains a fallback for fetch failures and `file://` previews.

Reduced motion skips the animations while retaining navigation in place. Ctrl/Cmd-click, external links, downloads, email links, and same-page anchors retain the browser's normal behavior. Page titles, URLs, keyboard focus, and scroll positions update during navigation; Back and Forward restore the corresponding page and scroll position. Page-specific listeners, observers, and animation frames are cleaned up during each swap. Implementation reference: [View Transition API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using).

## Content still to complete

The ECE Discovery Project has not been identified. Its placeholder has been removed from Work so the actual entry can be added later. Before the Discovery Showcase, add the actual project, at least 400 words describing its process and results, and a project photo/video created by Siddarth. Project image slots are now available; the original assignment's five-visual requirement still needs to be met before submission.

## Verification

The homepage uses one shared SVG board for the chip, navigation, and quick introduction. The navigation board fills the available height above the introduction and expands up to 1920px wide. Desktop navigation uses two columns of three, spaced toward the outer edges with rows at 14%, 50%, and 86% of the board height; narrow screens use two rows of three. The introduction is one centered paragraph with no greeting. Two subtle blue traces start at actual bottom-pin centers and frame the paragraph with equal clearance above and below. The CSS variables `--pin-start`, `--pin-end`, and `--pin-pitch` define both the painted pins and the JavaScript connection positions. The extra outer wires have been removed. An SVG mask keeps the frame traces clear of text and navigation. Geometry updates when the layout, fonts, or introduction size changes.

Current frame checks cover simulated board sizes of 1440 × 900, 1024 × 708, 700 × 620, 390 × 744, 320 × 536, and 844 × 360. Each layout has exactly two frame traces, starting on distinct painted pin centers and overlapping their tips by half a pixel. Checks also cover centered single-paragraph markup, removal of outer wires, equal frame clearance above and below the paragraph, text masks, JavaScript syntax, and CSS structure. The current styling revision has not had a browser visual check.

All ten HTML pages were checked for internal URLs, assets, unique IDs, page headings, and successful local HTTP responses. JavaScript syntax and simulated detail-page navigation checks passed, including fade timing, modifier keys, downloads, external/email/anchor links, reduced-motion changes, and back-navigation reset. Earlier visual checks in Vivaldi confirmed blue pulse navigation and the live PDF loading inside the resume embed.

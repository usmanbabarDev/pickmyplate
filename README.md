# PickMyPlate

Picture-based, read-aloud lunch choices for children in SEND schools.

Many autistic and non-verbal children find text menus hard to use. PickMyPlate shows today's
menu as large pictures, reads each dish aloud when tapped, and lets the child confirm their
choice one course at a time (Now → Next). Kitchen staff build the menu, tag the UK's 14
allergens, and use anonymous "diet cards" to hide dishes that aren't safe for a child.
Anonymous tallies help plan portions and reduce food waste.

![Choose lunch screen](docs/screens/choose.png)

## Why I built this

I work in the kitchen of a SEND school. Every day I saw children who couldn't read the lunch
menu, so an adult chose for them. PickMyPlate is my attempt to give those children their own choice.

## Features

- **Choose lunch**: big picture cards, text-to-speech, one course at a time, clear confirm step
- **Kitchen menu**: add dishes with an emoji or a real photo, 14 allergens, vegetarian/vegan/halal tags
- **Diet cards**: colour-coded cards (never children's names) that filter out unsafe dishes
- **Today's choices**: anonymous counts per dish for portion planning

## Privacy and safety

- No children's names or medical records are stored. Diet cards use colours and codes only.
- Data is stored only in the browser on the device being used (localStorage). Nothing is sent to a server.
- This is a prototype. Always check allergens against the kitchen's official records.

## Run it

No build step or server needed. Open `pickmyplate/index.html` in a browser
(an internet connection is needed to load Bootstrap and the fonts).

## Files

```
├── pickmyplate/
│   ├── index.html      Page structure (navbar, tabs, warning, toast)
│   ├── css/style.css   Custom styles on top of Bootstrap 5
│   ├── js/app.js       All behaviour: data, saving, screens, click handling
│   └── img/logo.svg    App logo
├── docs/               Product overview (HTML source) and screenshots
├── DEVLOG.md           Development log
└── BACKLOG.md          Planned tasks
```

Built with HTML, CSS, Bootstrap 5.3 and plain JavaScript.

## How it was built

The first prototype (September 2026) was built with AI coding assistance. I'm developing it
further myself, based on feedback from SEND school staff. Progress is recorded in [DEVLOG.md](DEVLOG.md).

## Roadmap

See [BACKLOG.md](BACKLOG.md). Highlights:

- [ ] Feedback from SENCOs, speech and language therapists and kitchen staff
- [ ] Printable A4 picture menu for classrooms
- [ ] Installable on tablets (PWA)
- [ ] Share one menu across several tablets
- [ ] Accessibility audit (WCAG 2.2 AA) and switch-access support

## Licence

[MIT](LICENSE)

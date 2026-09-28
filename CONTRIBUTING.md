# Contributing to Triple Yahoo!

Thanks for your interest in the game.

## Reporting bugs and suggesting ideas

Anyone can open an [issue](https://github.com/jimerb/Triple-Yahoo/issues). Useful bug reports include:

- What you did, what you expected, and what happened instead
- Your device and browser (for example "iPad, Safari" or "Windows 11, Chrome")
- A screenshot if the problem is visual

## Pull requests

Pull requests are limited to **approved collaborators**. The repository is set so only collaborators can open pull requests, and every change to `main` needs approval from the maintainer ([@jimerb](https://github.com/jimerb)).

If you'd like to contribute code:

1. Open an issue describing the change you have in mind.
2. If it's a good fit, the maintainer can add you as a collaborator.
3. Then create a branch, make your change, and open a pull request against `main`.

## Ground rules for changes

- Keep it dependency-free: plain HTML, CSS and JavaScript modules, no build step.
- Keep game rules in `engine.mjs` and add or update tests in `tests.mjs`. Run `node --test tests.mjs` before opening a pull request.
- Check the layout at phone, tablet and desktop sizes, in both dark and light themes.
- Don't add original Triple Yahoo! code, artwork or sound files. This project is an independent reinterpretation.

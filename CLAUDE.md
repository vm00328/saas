# CLAUDE.md

This file provides guidance to Claude Code when working in this repository.

## Project Overview

The project is a Healthcare Web App designed to be used by both patients and doctors. The intended functionality is to help doctors generate personalised messages to their patients based on key notes from the patient's visit, the date of the visit and the patient's name. In the future, this functionality may be enriched further by allowing doctors to upload blood results or other patient-related documents. The app is 

## Tech Stack

- Framework: Next.js (Pages Router)
- Language: TypeScript
- Styling: Tailwind CSS
- Package Manager: npm

## Development Commands

```bash
npm install    # Install dependencies
vercel dev     # local environment emulation
vercel --prod  # Deploy to production
```

## What to Avoid

- Do not modify `next.config.ts` without understanding the existing setup
- Do not add dependencies without checking if existing utilities cover the needs
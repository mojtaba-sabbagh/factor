// pdfjs-dist ships the legacy build as ESM only: `legacy/build/pdf.mjs` with a
// sibling `pdf.d.mts` declaration file. This project uses TypeScript's classic
// "node" module resolution (see tsconfig.json), which never looks at `.d.mts`
// files, so `await import("pdfjs-dist/legacy/build/pdf")` in
// src/components/invoice/LetterheadEditor.tsx has no types and `next build`
// fails with "Cannot find module ... or its corresponding type declarations".
//
// The subpath is still the correct runtime import (the legacy build is the one
// that also works in older browsers), so instead of switching the import to the
// modern build, this ambient declaration re-exports the officially typed entry
// point under the legacy path. Runtime behaviour is unchanged; this only tells
// TypeScript what that import returns.
declare module "pdfjs-dist/legacy/build/pdf" {
  export * from "pdfjs-dist";
}

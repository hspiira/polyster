/* The strip behind the status bar. iOS draws its clock and battery white in a
   full-screen web app, so whatever is under them has to stay dark. */
export function StatusBarBleed() {
  return (
    // data-theme pins the dark page colour whatever the app theme is: invisible
    // against a dark page, a near-black bar above a light one.
    <div
      aria-hidden="true"
      data-theme="dark"
      class="safe-top-height pointer-events-none fixed inset-x-0 top-0 z-40 bg-page"
    />
  )
}

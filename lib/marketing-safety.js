// Handles that are always safe to push to without extra confirmation —
// dedicated, unlinked test resources created specifically for this tool.
// Anything else is treated as a real, live page/collection: pushing to it
// still works, but the request must echo the handle back exactly in
// `confirmHandle`, which only happens if the UI made the user type it out
// (not just click through a dialog) — this is what should have caught the
// "taylormade" real-page overwrite.
export const SAFE_TEST_HANDLES = ['marketing-automation-test-page', 'marketing-automation-test']

export function checkPushGuard(handle, confirmHandle) {
  if (SAFE_TEST_HANDLES.includes(handle)) return null
  if (confirmHandle === handle) return null
  return `"${handle}" isn't one of the known safe test handles (${SAFE_TEST_HANDLES.join(', ')}). ` +
    `To push to it anyway, the request must include confirmHandle matching it exactly — ` +
    `the app should be asking you to type it out, not just click a dialog.`
}

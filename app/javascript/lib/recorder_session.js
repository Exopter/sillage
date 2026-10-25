/** @type {import("../controllers/fdr_connectivity_controller").default | null} */
let session = null

/** @param {import("../controllers/fdr_connectivity_controller").default | null} controller */
export function setRecorderSession(controller) { session = controller }

export function getRecorderSession() { return session }

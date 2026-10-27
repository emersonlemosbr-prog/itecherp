let askBeforeDelete = true
export function configureDeletionConfirmation(enabled) { askBeforeDelete = enabled }
export function confirmRecordDeletion(message) { return !askBeforeDelete || window.confirm(message) }

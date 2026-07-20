export const layers = ['image', 'latinDiplomatic', 'latinExpanded', 'englishLiteral', 'englishReadable', 'historicalNotes']

export function nextLayer(current) { return layers[(layers.indexOf(current) + 1) % layers.length] }

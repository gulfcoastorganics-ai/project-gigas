export function addSwipeNavigation(element, onPrevious, onNext) {
  let startX = 0
  element.addEventListener('touchstart', (event) => { startX = event.changedTouches[0].clientX }, { passive: true })
  element.addEventListener('touchend', (event) => { const delta = event.changedTouches[0].clientX - startX; if (Math.abs(delta) > 48) delta > 0 ? onPrevious() : onNext() }, { passive: true })
}

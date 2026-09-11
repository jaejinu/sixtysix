/**
 * setupFiles 는 모든 테스트 파일에 붙는다.
 * 도메인 테스트는 node 환경이라 DOM 전역이 없으므로 여기서 갈라야 한다.
 */
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');

  // jsdom 에 없는 것. 화면 코드가 이걸 쓰는 건 정상이다.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

export {};

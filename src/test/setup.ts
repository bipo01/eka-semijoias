import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// findBy*/waitFor give up after 1 s by default; the first render of a lazy admin screen can take longer
// when the whole suite runs in parallel, which made a few tests fail at random. 5 s keeps them honest.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Flat ESLint config (ESLint 9) for the Next.js web app. eslint-config-next 16
// ships a NATIVE flat config — spread its `core-web-vitals` array directly.
import next from 'eslint-config-next/core-web-vitals';

const config = [
  { ignores: ['.next/', 'node_modules/', 'next-env.d.ts', 'eslint.config.mjs'] },
  ...next,
  {
    // eslint-config-next 16 enables stricter react-hooks rules than the v15 we
    // ran before. Keep this migration behavior-neutral (it's an ESLint-9 / flat-
    // config infrastructure swap, not a rule-set change): turn OFF the newly
    // added rule that fires on the existing props→state sync effects in the
    // slide-over form panels. Adopting it (and refactoring those effects) is a
    // tracked follow-up, separate from this migration.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];

export default config;

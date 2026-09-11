// The server typechecks against @perfectmarkd/core's source (the shared
// paths alias in tsconfig.base.json), and that source relies on the ambient
// module declarations in core's vendor-types.d.ts. Declarations are picked
// up only from files in the program, so pull the file in here.
import '../../../packages/core/src/vendor-types.js';

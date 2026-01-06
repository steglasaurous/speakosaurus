const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '../../dist/apps/desktop/src');
const targetDir = path.join(__dirname, '../../dist/apps/desktop');

// Files to move
const filesToMove = ['bridge.js', 'bridge.js.map'];

filesToMove.forEach((file) => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);

  if (fs.existsSync(sourcePath)) {
    // Ensure target directory exists
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Move the file
    fs.renameSync(sourcePath, targetPath);
    console.log(`Moved ${file} from src/ to dist/apps/desktop/`);
  }
});



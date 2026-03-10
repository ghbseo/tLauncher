const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { default: pngToIco } = require("png-to-ico");

const projectRoot = path.resolve(__dirname, "..");
const sourcePng = path.join(projectRoot, "assets", "icon.png");
const outputDir = path.join(projectRoot, "build", "icons");
const outputIco = path.join(projectRoot, "assets", "icon.ico");

const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

async function renderPng(size) {
  const outputPath = path.join(outputDir, `${size}x${size}.png`);

  await sharp(sourcePng)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function generateIcons() {
  if (!fs.existsSync(sourcePng)) {
    throw new Error(`Source icon not found: ${sourcePng}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  for (const fileName of fs.readdirSync(outputDir)) {
    fs.rmSync(path.join(outputDir, fileName), { force: true, recursive: true });
  }

  const generatedPngs = [];
  for (const size of pngSizes) {
    generatedPngs.push(await renderPng(size));
  }

  const icoInputs = generatedPngs.filter((filePath) => {
    const size = Number(path.basename(filePath).split("x")[0]);
    return icoSizes.includes(size);
  });

  const icoBuffer = await pngToIco(icoInputs);
  fs.writeFileSync(outputIco, icoBuffer);
}

if (require.main === module) {
  generateIcons().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  generateIcons,
};

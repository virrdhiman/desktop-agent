import fs from 'fs'
import path from 'path'
import yazl from 'yazl'

const root = process.cwd()
const extensionDir = path.join(root, 'vscode-extension')
const releaseDir = path.join(root, 'release')
const manifestPath = path.join(extensionDir, 'package.json')
const pkg = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'))
const outPath = path.join(releaseDir, `${pkg.name}-${pkg.version}.vsix`)

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function contentTypes() {
  return `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Override PartName="/extension.vsixmanifest" ContentType="text/xml" />
</Types>
`
}

function vsixManifest() {
  const id = xmlEscape(pkg.name)
  const publisher = xmlEscape(pkg.publisher || 'virender-dhiman')
  const version = xmlEscape(pkg.version)
  const displayName = xmlEscape(pkg.displayName || pkg.name)
  const description = xmlEscape(pkg.description || displayName)
  const license = xmlEscape(pkg.license || 'SEE LICENSE')
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${id}" Version="${version}" Publisher="${publisher}" />
    <DisplayName>${displayName}</DisplayName>
    <Description xml:space="preserve">${description}</Description>
    <License>${license}</License>
    <Tags>vd-agent,agent,bridge,vscode</Tags>
    <Categories>Other</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xmlEscape(pkg.engines?.vscode || '^1.85.0')}" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
  </Assets>
</PackageManifest>
`
}

async function addDirectory(zip, sourceDir, zipDir) {
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.vscode') continue
    const source = path.join(sourceDir, entry.name)
    const target = `${zipDir}/${entry.name}`.replace(/\\/g, '/')
    if (entry.isDirectory()) await addDirectory(zip, source, target)
    else zip.addFile(source, target)
  }
}

await fs.promises.mkdir(releaseDir, { recursive: true })

const zip = new yazl.ZipFile()
zip.addBuffer(Buffer.from(contentTypes()), '[Content_Types].xml')
zip.addBuffer(Buffer.from(vsixManifest()), 'extension.vsixmanifest')
await addDirectory(zip, extensionDir, 'extension')

await new Promise((resolve, reject) => {
  zip.outputStream
    .pipe(fs.createWriteStream(outPath))
    .on('close', resolve)
    .on('error', reject)
  zip.end()
})

console.log(`Created ${outPath}`)

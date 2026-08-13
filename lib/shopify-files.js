import { shopifyGraphQL } from './shopify.js'

// Uploads a base64 data-URI image to Shopify Files and returns its real,
// permanent CDN URL. Needed because article body HTML must reference real
// hosted images, not embedded base64 blobs (which would bloat every page
// load with the full image data inline). Used for reference images pasted
// directly into a Google Doc (e.g. agency-supplied infographics) that have
// no other home in Shopify.
export async function uploadImageToShopify(dataUri, filename) {
  const match = dataUri.match(/^data:image\/(png|jpeg);base64,(.+)$/)
  if (!match) throw new Error('Not a recognised base64 image data URI')
  const [, ext, b64] = match
  const mimeType = ext === 'jpeg' ? 'image/jpeg' : 'image/png'
  const buffer = Buffer.from(b64, 'base64')

  const staged = await shopifyGraphQL(`
    mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }
  `, {
    input: [{
      filename,
      mimeType,
      httpMethod: 'POST',
      resource: 'IMAGE',
      fileSize: String(buffer.length),
    }],
  })
  const stagedErrors = staged.stagedUploadsCreate.userErrors
  if (stagedErrors?.length) throw new Error(stagedErrors.map(e => e.message).join('; '))
  const target = staged.stagedUploadsCreate.stagedTargets[0]

  const form = new FormData()
  for (const p of target.parameters) form.append(p.name, p.value)
  form.append('file', new Blob([buffer], { type: mimeType }), filename)
  const uploadRes = await fetch(target.url, { method: 'POST', body: form })
  if (!uploadRes.ok) throw new Error(`Staged upload POST failed: ${uploadRes.status}`)

  const created = await shopifyGraphQL(`
    mutation($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus ... on MediaImage { image { url } } }
        userErrors { field message }
      }
    }
  `, {
    files: [{ originalSource: target.resourceUrl, contentType: 'IMAGE' }],
  })
  const createErrors = created.fileCreate.userErrors
  if (createErrors?.length) throw new Error(createErrors.map(e => e.message).join('; '))
  const file = created.fileCreate.files[0]

  // fileCreate returns the image URL asynchronously in some cases (fileStatus
  // UPLOADED vs READY) — poll briefly if it's not immediately available.
  if (file.image?.url) return file.image.url
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1000))
    const check = await shopifyGraphQL(`
      query($id: ID!) { node(id: $id) { ... on MediaImage { image { url } } } }
    `, { id: file.id })
    if (check.node?.image?.url) return check.node.image.url
  }
  throw new Error('File uploaded but URL was not ready in time')
}

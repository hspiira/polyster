import { uploadProductImage, deleteProductImage } from '../online/catalogue'
import { ImageUploadField } from './ImageUploadField'

export function ProductImageField({
  shopId,
  imageUrl,
  onChange,
}: {
  shopId: string
  imageUrl: string
  onChange: (url: string) => void
}) {
  return (
    <ImageUploadField
      imageUrl={imageUrl}
      onChange={onChange}
      upload={(file) => uploadProductImage(shopId, file)}
      onDelete={deleteProductImage}
    />
  )
}

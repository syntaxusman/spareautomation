const enabledValue = String(
  import.meta.env.VITE_PRODUCT_IMAGE_WATERMARK_ENABLED ?? "true",
).toLowerCase();

export const PRODUCT_IMAGE_WATERMARK_ENABLED = !["false", "0", "off", "no"].includes(enabledValue);

export const PRODUCT_IMAGE_WATERMARK_TEXT =
  String(import.meta.env.VITE_PRODUCT_IMAGE_WATERMARK_TEXT ?? "© SPARES AUTOMATION").trim() ||
  "© SPARES AUTOMATION";

export function productImageWatermarkProps() {
  return PRODUCT_IMAGE_WATERMARK_ENABLED
    ? { "data-product-watermark": PRODUCT_IMAGE_WATERMARK_TEXT }
    : {};
}

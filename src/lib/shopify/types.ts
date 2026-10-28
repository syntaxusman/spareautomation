export type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

export type ShopifyImage = {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type ShopifyVariant = {
  id: string;
  title: string;
  sku: string | null;
  availableForSale: boolean;
  quantityAvailable?: number | null;
  price: ShopifyMoney;
  compareAtPrice: ShopifyMoney | null;
  selectedOptions: Array<{ name: string; value: string }>;
};

export type ShopifyProductResourceLink = {
  label: string;
  url: string;
};

export type ShopifyProductResource = {
  text: string;
  url: string;
};

export type ShopifyProductTechnicalDetails = {
  brand: string | null;
  mpnRange: string | null;
  setupVideoUrl: string | null;
  videoGuide: ShopifyProductResource | null;
  pdfGuide: ShopifyProductResource | null;
  datasheets: ShopifyProductResourceLink[];
  manuals: ShopifyProductResourceLink[];
};

export type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  vendor: string;
  description: string;
  descriptionHtml: string;
  availableForSale: boolean;
  productType: string;
  tags: string[];
  featuredImage: ShopifyImage | null;
  images: ShopifyImage[];
  technicalDetails: ShopifyProductTechnicalDetails;
  priceRange: {
    minVariantPrice: ShopifyMoney;
    maxVariantPrice: ShopifyMoney;
  };
  variants: ShopifyVariant[];
};

export type ShopifyCollection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: ShopifyImage | null;
  products: ShopifyProduct[];
};

export type ShopifyCartLine = {
  id: string;
  quantity: number;
  merchandise: ShopifyVariant & {
    product: Pick<ShopifyProduct, "id" | "handle" | "title" | "featuredImage">;
  };
  cost: {
    totalAmount: ShopifyMoney;
  };
};

export type ShopifyCart = {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: {
    subtotalAmount: ShopifyMoney;
    totalAmount: ShopifyMoney;
  };
  lines: ShopifyCartLine[];
};

export const reports = {
  'sales-by-sku': {
    name: 'Sales by SKU',
    description: 'All orders broken down by SKU, product, variant, quantity and revenue. SKU always populated from raw Shopify data.',
    requiresDates: true,
    endpoint: 'orders.json',
    key: 'orders',
    apiParams: ({ startDate, endDate }) => ({
      status: 'any',
      created_at_min: new Date(startDate).toISOString(),
      created_at_max: new Date(endDate + 'T23:59:59').toISOString(),
      fields: 'id,name,created_at,line_items,financial_status',
    }),
    transform: (orders) => orders.flatMap(order =>
      order.line_items.map(item => ({
        Date: order.created_at.slice(0, 10),
        Order: order.name,
        Status: order.financial_status,
        SKU: item.sku || '—',
        Product: item.title,
        Variant: item.variant_title || '—',
        Qty: item.quantity,
        'Unit Price': `£${parseFloat(item.price).toFixed(2)}`,
        Total: `£${(parseFloat(item.price) * item.quantity).toFixed(2)}`,
      }))
    ),
  },

  'inventory-on-hand': {
    name: 'Inventory on Hand',
    description: 'Live snapshot of current stock levels across every active product and variant. Use this to see what\'s in stock right now, spot low stock, or do a stocktake check.',
    requiresDates: false,
    endpoint: 'products.json',
    key: 'products',
    apiParams: () => ({
      fields: 'id,title,vendor,product_type,variants',
      status: 'active',
    }),
    transform: (products) => products.flatMap(product =>
      product.variants.map(v => ({
        SKU: v.sku || '—',
        Product: product.title,
        Variant: v.title !== 'Default Title' ? v.title : '—',
        Brand: product.vendor || '—',
        Type: product.product_type || '—',
        Available: v.inventory_quantity,
        Price: `£${parseFloat(v.price).toFixed(2)}`,
      }))
    ),
  },

  'product-export': {
    name: 'Product Export',
    description: 'Full product catalogue with all editable fields — SKU, price, compare-at, inventory, brand, type, status. Download, edit in Excel, re-upload to update.',
    requiresDates: false,
    endpoint: 'products.json',
    key: 'products',
    apiParams: () => ({
      fields: 'id,title,vendor,product_type,status,tags,variants,created_at',
    }),
    transform: (products) => products.flatMap(product =>
      product.variants.map(v => ({
        'Product ID': product.id,
        'Variant ID': v.id,
        'Date Created': product.created_at ? product.created_at.slice(0, 10) : '',
        'SKU': v.sku || '',
        'Title': product.title,
        'Variant': v.title !== 'Default Title' ? v.title : '',
        'Price': v.price,
        'Compare At Price': v.compare_at_price || '',
        'Inventory': v.inventory_quantity,
        'Brand': product.vendor || '',
        'Type': product.product_type || '',
        'Status': product.status,
        'Barcode': v.barcode || '',
        'Tags': product.tags || '',
      }))
    ),
  },
}

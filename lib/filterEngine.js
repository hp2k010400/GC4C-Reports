export const COMBINED_FIELDS = [
  { key: 'Title',         label: 'Title',                        type: 'text' },
  { key: 'SKU',           label: 'SKU',                          type: 'text' },
  { key: 'Variant',       label: 'Variant',                      type: 'text' },
  { key: 'Type',          label: 'Product Type',                 type: 'text' },
  { key: 'Brand',         label: 'Brand',                        type: 'text' },
  { key: 'Status',        label: 'Status',                       type: 'select', options: ['active', 'draft', 'archived'] },
  { key: 'Price',         label: 'Price (£)',                    type: 'number' },
  { key: 'Compare At',    label: 'Compare-at Price (£)',         type: 'number' },
  { key: 'Inventory',     label: 'Current Inventory',            type: 'number' },
  { key: 'Units Sold',    label: 'Units Sold (period)',          type: 'number' },
  { key: 'Revenue',       label: 'Revenue (£, period)',          type: 'number' },
  { key: 'Orders',        label: 'Order Count (period)',         type: 'number' },
  { key: 'Last Sold',     label: 'Last Sold Date',              type: 'date' },
  { key: 'Date Created',  label: 'Date Created',                 type: 'date' },
  { key: 'Tags',          label: 'Tags',                         type: 'text' },
  { key: '_never_sold',   label: 'Never Sold (in period)',       type: 'boolean' },
  { key: '_selling_oos',  label: 'Selling While Out of Stock',   type: 'boolean' },
  { key: '_on_sale',      label: 'Is On Sale',                   type: 'boolean' },
  { key: '_out_of_stock', label: 'Is Out of Stock',              type: 'boolean' },
  { key: '_low_stock',    label: 'Is Low Stock (< 5)',           type: 'boolean' },
  { key: '_no_sku',       label: 'Has No SKU',                   type: 'boolean' },
]

export const ORDER_FIELDS = [
  { key: 'Order',              label: 'Order Number',       type: 'text' },
  { key: 'Date',               label: 'Date',               type: 'date' },
  { key: 'Financial Status',   label: 'Financial Status',   type: 'select', options: ['paid', 'pending', 'refunded', 'partially_refunded', 'voided', 'authorized'] },
  { key: 'Fulfillment Status', label: 'Fulfillment Status', type: 'select', options: ['fulfilled', 'unfulfilled', 'partial', 'restocked'] },
  { key: 'Customer',           label: 'Customer Name',      type: 'text' },
  { key: 'Email',              label: 'Customer Email',     type: 'text' },
  { key: 'SKU',                label: 'SKU',                type: 'text' },
  { key: 'Product',            label: 'Product',            type: 'text' },
  { key: 'Variant',            label: 'Variant',            type: 'text' },
  { key: 'Qty',                label: 'Quantity',           type: 'number' },
  { key: 'Unit Price',         label: 'Unit Price (£)',     type: 'number' },
  { key: 'Line Total',         label: 'Line Total (£)',     type: 'number' },
  { key: 'Order Total',        label: 'Order Total (£)',    type: 'number' },
  { key: 'Discount',           label: 'Discount (£)',       type: 'number' },
  { key: 'Discount Code',      label: 'Discount Code',      type: 'text' },
  { key: 'Tags',               label: 'Tags',               type: 'text' },
  { key: 'Channel',            label: 'Channel',            type: 'text' },
]

export const PRODUCT_FIELDS = [
  { key: 'Title',       label: 'Title',              type: 'text' },
  { key: 'SKU',         label: 'SKU',                type: 'text' },
  { key: 'Variant',     label: 'Variant',            type: 'text' },
  { key: 'Type',        label: 'Product Type',       type: 'text' },
  { key: 'Brand',       label: 'Brand',              type: 'text' },
  { key: 'Status',      label: 'Status',             type: 'select', options: ['active', 'draft', 'archived'] },
  { key: 'Tags',        label: 'Tags',               type: 'text' },
  { key: 'Price',       label: 'Price (£)',          type: 'number' },
  { key: 'Compare At',  label: 'Compare-at Price (£)', type: 'number' },
  { key: 'Inventory',   label: 'Inventory',          type: 'number' },
  { key: 'Barcode',     label: 'Barcode',            type: 'text' },
  { key: 'Date Created', label: 'Date Created',      type: 'date' },
  { key: 'Date Updated', label: 'Date Updated',      type: 'date' },
  { key: 'Handle',      label: 'Handle (URL)',        type: 'text' },
  { key: '_on_sale',         label: 'Is On Sale',            type: 'boolean' },
  { key: '_out_of_stock',    label: 'Is Out of Stock',       type: 'boolean' },
  { key: '_low_stock',       label: 'Is Low Stock (< 5)',    type: 'boolean' },
  { key: '_no_sku',          label: 'Has No SKU',            type: 'boolean' },
  { key: '_no_compare',      label: 'No Compare-at Price',   type: 'boolean' },
  { key: '_price_eq_compare', label: 'Price = Compare-at',   type: 'boolean' },
]

export const CONDITIONS = {
  text:    ['contains', 'does not contain', 'equals', 'does not equal', 'starts with', 'is empty', 'is not empty'],
  number:  ['=', '>', '<', '>=', '<=', 'is empty', 'is not empty'],
  date:    ['after', 'before', 'on'],
  select:  ['equals', 'does not equal'],
  boolean: ['is true', 'is false'],
}

export function needsValue(condition) {
  return !['is empty', 'is not empty', 'is true', 'is false'].includes(condition)
}

function applyFilter(row, filter) {
  const { field, condition, value } = filter

  if (field === '_on_sale') {
    const p = parseFloat(row['Price']) || 0
    const c = parseFloat(row['Compare At']) || 0
    const r = c > 0 && p < c
    return condition === 'is true' ? r : !r
  }
  if (field === '_out_of_stock') {
    const r = (parseInt(row['Inventory']) || 0) <= 0
    return condition === 'is true' ? r : !r
  }
  if (field === '_low_stock') {
    const inv = parseInt(row['Inventory']) || 0
    const r = inv > 0 && inv < 5
    return condition === 'is true' ? r : !r
  }
  if (field === '_no_sku') {
    const r = !row['SKU'] || row['SKU'] === ''
    return condition === 'is true' ? r : !r
  }
  if (field === '_no_compare') {
    const r = !row['Compare At'] || row['Compare At'] === ''
    return condition === 'is true' ? r : !r
  }
  if (field === '_never_sold') {
    const r = (parseInt(row['Units Sold']) || 0) === 0
    return condition === 'is true' ? r : !r
  }
  if (field === '_selling_oos') {
    const inv  = parseInt(row['Inventory']) || 0
    const sold = parseInt(row['Units Sold']) || 0
    const r = inv <= 0 && sold > 0
    return condition === 'is true' ? r : !r
  }
  if (field === '_price_eq_compare') {
    const p = parseFloat(row['Price']) || 0
    const c = parseFloat(row['Compare At']) || 0
    const r = c > 0 && p === c
    return condition === 'is true' ? r : !r
  }

  const cellVal = row[field]

  if (condition === 'is empty') return !cellVal || String(cellVal) === ''
  if (condition === 'is not empty') return !!(cellVal && String(cellVal) !== '')

  const strVal = String(cellVal ?? '').toLowerCase()
  const filterVal = String(value ?? '').toLowerCase()

  if (condition === 'contains')         return strVal.includes(filterVal)
  if (condition === 'does not contain') return !strVal.includes(filterVal)
  if (condition === 'equals')           return strVal === filterVal
  if (condition === 'does not equal')   return strVal !== filterVal
  if (condition === 'starts with')      return strVal.startsWith(filterVal)

  const numVal    = parseFloat(String(cellVal ?? '').replace(/[£,]/g, ''))
  const numFilter = parseFloat(String(value ?? '').replace(/[£,]/g, ''))
  if (condition === '=')  return numVal === numFilter
  if (condition === '>')  return numVal > numFilter
  if (condition === '<')  return numVal < numFilter
  if (condition === '>=') return numVal >= numFilter
  if (condition === '<=') return numVal <= numFilter

  if (condition === 'after')  return new Date(cellVal) > new Date(value)
  if (condition === 'before') return new Date(cellVal) < new Date(value)
  if (condition === 'on')     return String(cellVal).slice(0, 10) === value

  return true
}

export function applyFilters(rows, filters, logic = 'AND') {
  const active = filters.filter(f => f.field && f.condition)
  if (!active.length) return rows
  if (logic === 'AND') return rows.filter(row => active.every(f => applyFilter(row, f)))
  return rows.filter(row => active.some(f => applyFilter(row, f)))
}

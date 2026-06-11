/** Installation is included in machine price — never push as a separate HubSpot line item. */
export function isInstallationLineItem(description: string): boolean {
  return /professional installation/i.test(description ?? '')
}

export function lineItemsForHubSpot<T extends { description: string }>(items: T[]): T[] {
  return items.filter((item) => !isInstallationLineItem(item.description))
}

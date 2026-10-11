import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import styles from "../styles/inventory.module.css";

type Product = {
  id: string;
  title: string;
  status: string;
  totalInventory: number;
  variants: {
    nodes: { price: string }[];
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
      #grapghql
      query InventoryProducts {
        products(first: 100){
          nodes{
            id
            title
            status
            totalInventory
            variants(first: 1){
              nodes{
                price
              }
            }
          }
        }
      }
    `);

  const result = await response.json();

  if (result.errors) {
    throw new Response("Failed to fetch Shopify Products", {
      status: 502,
    });
  }

  return {
    products: (result.data?.products?.nodes ?? []) as Product[],
  };
};

type StockFilter = "all" | "low" | "out";

function InventoryIcon({ refresh = false }: { refresh?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {refresh ? (
        <>
          <path d="M20 7v5h-5" />
          <path d="M4 17v-5h5" />
          <path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" />
        </>
      ) : (
        <>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="M3 8v9l9 5 9-5V8M12 13v9M7.5 5.5l9 5" />
        </>
      )}
    </svg>
  );
}

function getStockStatus(quantity: number) {
  if (quantity <= 0) return "Out of stock";
  if (quantity < 10) return "Low stock";
  return "In stock";
}

function escapeCsvField(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default function InventoryDashboard() {
  const { products } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const refreshing = revalidator.state !== "idle";
  const lowStock = products.filter(
    (p) => p.totalInventory > 0 && p.totalInventory < 10,
  ).length;
  const outOfStock = products.filter((p) => p.totalInventory <= 0).length;
  const totalInventory = products.reduce((sum, p) => sum + p.totalInventory, 0);
  const filtered = products.filter((p) => {
    const matchesSearch = p.title
      .toLowerCase()
      .includes(search.trim().toLowerCase());
    const matchesStock =
      stockFilter === "all" ||
      (stockFilter === "low"
        ? p.totalInventory > 0 && p.totalInventory < 10
        : p.totalInventory <= 0);
    return matchesSearch && matchesStock;
  });
  const filters: { value: StockFilter; label: string; count: number }[] = [
    { value: "all", label: "All products", count: products.length },
    { value: "low", label: "Low stock", count: lowStock },
    { value: "out", label: "Out of stock", count: outOfStock },
  ];
  const resetFilters = () => {
    setSearch("");
    setStockFilter("all");
  };
  const exportCsv = () => {
    const rows = [
      ["Name", "Price", "Inventory quantity", "Stock status"],
      ...products.map((product) => [
        product.title,
        product.variants.nodes[0]?.price ?? "",
        product.totalInventory,
        getStockStatus(product.totalInventory),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((field) => escapeCsvField(field)).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inventory-export.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <main className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>
            <InventoryIcon /> INVENTORY MANAGER
          </div>
          <h1>Inventory overview</h1>
          <p>Keep an eye on your products and stay ahead of stock shortages.</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.exportButton}
            onClick={exportCsv}
            disabled={products.length === 0}
          >
            Export CSV
          </button>
          <button
            className={styles.refreshButton}
            onClick={() => revalidator.revalidate()}
            disabled={refreshing}
          >
            <span className={refreshing ? styles.spinning : undefined}>
              <InventoryIcon refresh />
            </span>
            {refreshing ? "Refreshing…" : "Refresh inventory"}
          </button>
        </div>
      </header>

      <section className={styles.metrics} aria-label="Inventory summary">
        {[
          {
            label: "Products loaded",
            value: products.length,
            note: "Products in this overview",
            tone: "neutral",
          },
          {
            label: "Total units",
            value: totalInventory,
            note: "Across loaded products",
            tone: "green",
          },
          {
            label: "Low stock",
            value: lowStock,
            note: "Products with 1–9 units",
            tone: "amber",
          },
          {
            label: "Out of stock",
            value: outOfStock,
            note: "Products with no available units",
            tone: "red",
          },
        ].map((metric) => (
          <article className={styles.metric} key={metric.label}>
            <div className={styles.metricLabel}>
              <span>{metric.label}</span>
              <span className={`${styles.indicator} ${styles[metric.tone]}`} />
            </div>
            <strong>{metric.value.toLocaleString("en-US")}</strong>
            <p>{metric.note}</p>
          </article>
        ))}
      </section>

      <section className={styles.products} aria-labelledby="products-heading">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="products-heading">
              Products <span className={styles.count}>{products.length}</span>
            </h2>
            <p>A clear view of your current stock levels.</p>
          </div>
          <span className={styles.source}>Shopify inventory</span>
        </div>
        <div className={styles.toolbar}>
          <div
            className={styles.filters}
            role="group"
            aria-label="Filter by stock level"
          >
            {filters.map((filter) => (
              <button
                key={filter.value}
                className={`${styles.filter} ${stockFilter === filter.value ? styles.selected : ""}`}
                aria-pressed={stockFilter === filter.value}
                onClick={() => setStockFilter(filter.value)}
              >
                {filter.label}
                <span>{filter.count}</span>
              </button>
            ))}
          </div>
          <div className={styles.search}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="10.5" cy="10.5" r="6.5" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              type="search"
              aria-label="Search products by name"
              placeholder="Search products…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        {/* Keyboard focus enables horizontal scrolling of the table. */}
        <div
          className={styles.tableScroll}
          role="region"
          aria-label="Product inventory"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-busy={refreshing}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className={styles.numeric}>
                  Price
                </th>
                <th scope="col" className={styles.numeric}>
                  Available units
                </th>
                <th scope="col">Stock status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const tone =
                  product.totalInventory <= 0
                    ? "red"
                    : product.totalInventory < 10
                      ? "amber"
                      : "green";
                const status = getStockStatus(product.totalInventory);
                return (
                  <tr key={product.id}>
                    <th scope="row">
                      <div className={styles.productName}>
                        <span className={styles.productIcon}>
                          <InventoryIcon />
                        </span>
                        <span>{product.title}</span>
                      </div>
                    </th>
                    <td className={styles.numeric}>
                      {product.variants.nodes[0]?.price ?? "—"}
                    </td>
                    <td className={`${styles.numeric} ${styles.quantity}`}>
                      {product.totalInventory.toLocaleString("en-US")}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${styles[tone]}`}>
                        <span className={styles.badgeDot} />
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>
                <InventoryIcon />
              </span>
              <h3>
                {products.length === 0
                  ? "Your inventory starts here"
                  : "No matching products"}
              </h3>
              <p>
                {products.length === 0
                  ? "Add products in Shopify, then refresh to see your inventory here."
                  : "Try another product name or adjust your stock filter."}
              </p>
              {products.length > 0 && (
                <button className={styles.resetButton} onClick={resetFilters}>
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
        <footer className={styles.tableFooter}>
          <span role="status">
            Showing <strong>{filtered.length}</strong> of{" "}
            <strong>{products.length}</strong> loaded products
          </span>
          <span>Overview includes up to 100 products</span>
        </footer>
      </section>
      <p className={styles.footnote}>
        <span aria-hidden="true">ⓘ</span> Stock guide: 10+ units in stock · 1–9
        units low stock · 0 or fewer out of stock
      </p>
    </main>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

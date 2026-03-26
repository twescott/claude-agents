#!/usr/bin/env node
/**
 * WordPress.com MCP Server
 * Uses WordPress.com REST API v2 with OAuth Bearer token.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const TOKEN = process.env.WPCOM_TOKEN;
const SITE_ID = process.env.WPCOM_SITE_ID;

if (!TOKEN || !SITE_ID) {
  process.stderr.write("Missing WPCOM_TOKEN or WPCOM_SITE_ID\n");
  process.exit(1);
}

const BASE = `https://public-api.wordpress.com/wp/v2/sites/${SITE_ID}`;

async function wpFetch(path, options = {}) {
  const { method = "GET", body } = options;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) throw new Error(`WP API ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const tools = [
  {
    name: "wp_list_posts",
    description: "List recent WordPress posts",
    inputSchema: {
      type: "object",
      properties: {
        per_page: { type: "number", description: "Posts per page (default 10)" },
        status: { type: "string", description: "Post status: publish, draft, etc." },
        search: { type: "string", description: "Search keyword" },
      },
    },
  },
  {
    name: "wp_get_post",
    description: "Get a single WordPress post by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "number", description: "Post ID" },
      },
    },
  },
  {
    name: "wp_create_post",
    description: "Create a new WordPress post",
    inputSchema: {
      type: "object",
      required: ["title", "content"],
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "HTML content" },
        status: { type: "string", description: "publish or draft (default: draft)" },
        excerpt: { type: "string" },
        categories: { type: "array", items: { type: "number" }, description: "Category IDs" },
        tags: { type: "array", items: { type: "number" }, description: "Tag IDs" },
      },
    },
  },
  {
    name: "wp_update_post",
    description: "Update an existing WordPress post",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        content: { type: "string" },
        status: { type: "string" },
        excerpt: { type: "string" },
        categories: { type: "array", items: { type: "number" } },
        tags: { type: "array", items: { type: "number" } },
      },
    },
  },
  {
    name: "wp_list_categories",
    description: "List all WordPress categories",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wp_list_tags",
    description: "List all WordPress tags",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wp_list_pages",
    description: "List WordPress pages",
    inputSchema: {
      type: "object",
      properties: {
        per_page: { type: "number", description: "Pages per page (default 20)" },
        status: { type: "string", description: "Page status: publish, draft, etc." },
        search: { type: "string", description: "Search keyword" },
      },
    },
  },
  {
    name: "wp_create_page",
    description: "Create a new WordPress page",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        content: { type: "string", description: "HTML content (default: empty)" },
        status: { type: "string", description: "publish or draft (default: publish)" },
        slug: { type: "string", description: "URL slug" },
        parent: { type: "number", description: "Parent page ID" },
      },
    },
  },
  {
    name: "wp_update_page",
    description: "Update an existing WordPress page",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "number" },
        title: { type: "string" },
        content: { type: "string" },
        status: { type: "string" },
        slug: { type: "string" },
      },
    },
  },
  {
    name: "wp_delete_post",
    description: "Move a WordPress post or page to trash",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "number", description: "Post or page ID to trash" },
        type: { type: "string", description: "post or page (default: post)" },
      },
    },
  },
  {
    name: "wp_list_template_parts",
    description: "List block theme template parts (header, footer, etc.)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "wp_get_template_part",
    description: "Get a single block theme template part by ID",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Template part ID (e.g. 'twentytwentyfour//footer')" },
      },
    },
  },
  {
    name: "wp_update_template_part",
    description: "Update a block theme template part (e.g. footer, header). Content is block HTML.",
    inputSchema: {
      type: "object",
      required: ["id", "content"],
      properties: {
        id: { type: "string", description: "Template part ID" },
        content: { type: "string", description: "Full block HTML content for the template part" },
      },
    },
  },
];

const server = new Server(
  { name: "wordpress-com", version: "1.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    let result;
    switch (name) {
      case "wp_list_posts": {
        const params = new URLSearchParams();
        if (args.per_page) params.set("per_page", args.per_page);
        if (args.status) params.set("status", args.status);
        if (args.search) params.set("search", args.search);
        result = await wpFetch(`/posts?${params}`);
        result = result.map(p => ({ id: p.id, title: p.title?.rendered, status: p.status, date: p.date, link: p.link }));
        break;
      }
      case "wp_get_post":
        result = await wpFetch(`/posts/${args.id}`);
        break;
      case "wp_create_post": {
        const { title, content, status = "draft", excerpt, categories, tags } = args;
        result = await wpFetch("/posts", { method: "POST", body: { title, content, status, excerpt, categories, tags } });
        result = { id: result.id, title: result.title?.rendered, status: result.status, link: result.link };
        break;
      }
      case "wp_update_post": {
        const { id, ...fields } = args;
        result = await wpFetch(`/posts/${id}`, { method: "POST", body: fields });
        result = { id: result.id, title: result.title?.rendered, status: result.status, link: result.link };
        break;
      }
      case "wp_list_categories":
        result = await wpFetch("/categories?per_page=100");
        result = result.map(c => ({ id: c.id, name: c.name, slug: c.slug, count: c.count }));
        break;
      case "wp_list_tags":
        result = await wpFetch("/tags?per_page=100");
        result = result.map(t => ({ id: t.id, name: t.name, slug: t.slug, count: t.count }));
        break;
      case "wp_list_pages": {
        const params = new URLSearchParams();
        params.set("per_page", args.per_page || 20);
        if (args.status) params.set("status", args.status);
        if (args.search) params.set("search", args.search);
        result = await wpFetch(`/pages?${params}`);
        result = result.map(p => ({ id: p.id, title: p.title?.rendered, status: p.status, slug: p.slug, link: p.link }));
        break;
      }
      case "wp_create_page": {
        const { title, content = "", status = "publish", slug, parent } = args;
        result = await wpFetch("/pages", { method: "POST", body: { title, content, status, ...(slug ? { slug } : {}), ...(parent ? { parent } : {}) } });
        result = { id: result.id, title: result.title?.rendered, status: result.status, slug: result.slug, link: result.link };
        break;
      }
      case "wp_update_page": {
        const { id, ...fields } = args;
        result = await wpFetch(`/pages/${id}`, { method: "POST", body: fields });
        result = { id: result.id, title: result.title?.rendered, status: result.status, slug: result.slug, link: result.link };
        break;
      }
      case "wp_delete_post": {
        const type = args.type === "page" ? "pages" : "posts";
        result = await wpFetch(`/${type}/${args.id}`, { method: "DELETE" });
        result = { id: result.id, status: result.status, deleted: true };
        break;
      }
      case "wp_list_template_parts": {
        result = await wpFetch("/wp_template_part?per_page=100&context=edit");
        result = result.map(t => ({ id: t.id, slug: t.slug, title: t.title?.rendered, area: t.area, theme: t.theme }));
        break;
      }
      case "wp_get_template_part": {
        result = await wpFetch(`/wp_template_part/${encodeURIComponent(args.id)}?context=edit`);
        result = { id: result.id, slug: result.slug, title: result.title?.rendered, area: result.area, content: result.content?.raw };
        break;
      }
      case "wp_update_template_part": {
        result = await wpFetch(`/wp_template_part/${encodeURIComponent(args.id)}`, { method: "POST", body: { content: args.content } });
        result = { id: result.id, slug: result.slug, status: result.status };
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

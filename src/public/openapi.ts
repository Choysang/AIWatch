export const OPENAPI_YAML = `openapi: 3.1.0
info:
  title: AIWatch Public API
  version: 0.6.0
  description: Anonymous read-only access to AIWatch items and daily reports.
servers:
  - url: https://aiwatch.icu
paths:
  /api/public/items:
    get:
      summary: List AIWatch items
      parameters:
        - name: mode
          in: query
          schema:
            type: string
            enum: [selected, all, latest, personalized]
            default: selected
        - name: since
          in: query
          schema:
            type: string
            enum: [today, week, month, all]
            default: all
        - name: category
          in: query
          schema:
            type: string
            enum: [product, technology, tips, discussion]
        - name: contentTypes
          in: query
          schema:
            type: string
            description: Comma-separated content types.
        - name: q
          in: query
          schema:
            type: string
        - name: tags
          in: query
          schema:
            type: string
        - name: sourceTypes
          in: query
          schema:
            type: string
        - name: sources
          in: query
          schema:
            type: string
        - name: level
          in: query
          schema:
            type: string
            enum: [B, A, S]
        - name: minScore
          in: query
          schema:
            type: integer
            minimum: 0
            maximum: 100
        - name: take
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 50
            default: 20
        - name: cursor
          in: query
          schema:
            type: string
      responses:
        "200":
          description: A page of items.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PublicItemsResponse"
  /api/public/daily:
    get:
      summary: Latest AIWatch daily report
      responses:
        "200":
          description: Latest report.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PublicReport"
  /api/public/daily/{date}:
    get:
      summary: AIWatch daily report by date
      parameters:
        - name: date
          in: path
          required: true
          schema:
            type: string
            pattern: "^\\\\d{4}-\\\\d{2}-\\\\d{2}$"
      responses:
        "200":
          description: Report for date.
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/PublicReport"
  /api/public/dailies:
    get:
      summary: List available daily report dates
      parameters:
        - name: take
          in: query
          schema:
            type: integer
            minimum: 1
            maximum: 60
            default: 14
      responses:
        "200":
          description: Daily report archive.
          content:
            application/json:
              schema:
                type: object
                required: [dailies]
                properties:
                  dailies:
                    type: array
                    items:
                      $ref: "#/components/schemas/PublicReportListItem"
components:
  schemas:
    PublicItemsResponse:
      type: object
      required: [items, next_cursor]
      properties:
        items:
          type: array
          items:
            $ref: "#/components/schemas/PublicItem"
        next_cursor:
          type: [string, "null"]
    PublicItem:
      type: object
      required: [id, title, permalink, tags, media]
      properties:
        id:
          type: string
        title:
          type: string
        url:
          type: [string, "null"]
        permalink:
          type: string
        body:
          type: [string, "null"]
        source_name:
          type: [string, "null"]
        author_name:
          type: [string, "null"]
        author_handle:
          type: [string, "null"]
        summary:
          type: [string, "null"]
        recommendation_reason:
          type: [string, "null"]
        quality_score:
          type: [integer, "null"]
        view_count:
          type: integer
        selected_level:
          type: string
          enum: [none, B, A, S]
        selected_label:
          type: [string, "null"]
        category:
          type: [string, "null"]
        content_type:
          type: [string, "null"]
        tags:
          type: array
          items:
            type: string
        published_at:
          type: [string, "null"]
          format: date-time
        promoted_at:
          type: [string, "null"]
          format: date-time
        media: {}
    PublicReport:
      type: object
      required: [kind, date, title, summary, sections, generated_at]
      properties:
        kind:
          type: string
          enum: [daily, weekly, monthly]
        date:
          type: string
        title:
          type: string
        summary:
          type: string
        reading_path:
          type: array
          items:
            type: string
        sections:
          type: array
          items:
            $ref: "#/components/schemas/ReportSection"
        generated_at:
          type: string
          format: date-time
    ReportSection:
      type: object
      required: [key, title, items]
      properties:
        key:
          type: string
        title:
          type: string
        items:
          type: array
          items:
            $ref: "#/components/schemas/ReportItem"
    ReportItem:
      type: object
      required: [id, title, tags]
      properties:
        id:
          type: string
        title:
          type: string
        conclusion:
          type: [string, "null"]
        why:
          type: [string, "null"]
        quality_score:
          type: [integer, "null"]
        selected_level:
          type: string
        selected_label:
          type: [string, "null"]
        category:
          type: [string, "null"]
        tags:
          type: array
          items:
            type: string
        source_name:
          type: [string, "null"]
        source_handle:
          type: [string, "null"]
        url:
          type: [string, "null"]
    PublicReportListItem:
      type: object
      required: [date, title, generated_at, item_count]
      properties:
        date:
          type: string
        title:
          type: string
        summary:
          type: [string, "null"]
        generated_at:
          type: string
          format: date-time
        item_count:
          type: integer
`;

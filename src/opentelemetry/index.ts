import type { SpanExporter, ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { Pago, type SDKOptions } from "@pago-sh/sdk";
import type { EventCreateCustomer } from "@pago-sh/sdk/models/components/eventcreatecustomer.js";
import type { EventCreateExternalCustomer } from "@pago-sh/sdk/models/components/eventcreateexternalcustomer.js";
import type { EventMetadataInput } from "@pago-sh/sdk/models/components/eventmetadatainput.js";

const convertAttributesToMetadata = (
  attributes: ReadableSpan["attributes"]
): Record<string, EventMetadataInput> => {
  return Object.entries(attributes).reduce((acc, [key, value]) => {
    if (typeof value === "string") {
      acc[key] = value;
    } else if (typeof value === "number") {
      acc[key] = value;
    } else if (typeof value === "boolean") {
      acc[key] = value;
    } else if (value instanceof Date) {
      acc[key] = value.toISOString();
    }

    return acc;
  }, {} as Record<string, EventMetadataInput>);
};

const customerIdKey = "customerId" as const;
const externalCustomerIdKey = "externalCustomerId" as const;

const convertSpanToPagoEvent = (
  span: ReadableSpan
): (EventCreateCustomer | EventCreateExternalCustomer) | null => {
  const customerId = span.attributes[customerIdKey];
  const externalCustomerId = span.attributes[externalCustomerIdKey];

  if (customerId && typeof customerId === "string") {
    return {
      name: span.name,
      customerId,
      metadata: convertAttributesToMetadata(span.attributes),
      parentId: span.parentSpanContext?.spanId,
      externalId: span.spanContext().spanId,
    };
  }

  if (externalCustomerId && typeof externalCustomerId === "string") {
    return {
      name: span.name,
      externalCustomerId,
      metadata: convertAttributesToMetadata(span.attributes),
      parentId: span.parentSpanContext?.spanId,
      externalId: span.spanContext().spanId,
    };
  }

  return null;
};

export class PagoTraceExporter implements SpanExporter {
  constructor(private options: SDKOptions) {}

  async export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ) {
    try {
      const spansWithCustomerId = spans.filter(
        (span) =>
          "customerId" in span.attributes ||
          "externalCustomerId" in span.attributes
      );

      const payload = spansWithCustomerId
        .map(convertSpanToPagoEvent)
        .filter((event) => event !== null);

      const pago = new Pago(this.options);

      await pago.events.ingest({
        events: payload,
      });

      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (err) {
      resultCallback({ code: ExportResultCode.FAILED, error: err as Error });
    }
  }

  shutdown() {
    return Promise.resolve();
  }
}

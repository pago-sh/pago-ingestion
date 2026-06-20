import { Pago, type SDKOptions } from "@pago-sh/sdk";
import type { EventCreateCustomer } from "@pago-sh/sdk/models/components/eventcreatecustomer.js";
import type {
  IngestionStrategy,
  IngestionStrategyContext,
  IngestionStrategyCustomer,
  IngestionStrategyExternalCustomer,
} from "./strategy";
import type { EventMetadataInput } from "@pago-sh/sdk/models/components/eventmetadatainput.js";
import type { CostMetadataInput } from "@pago-sh/sdk/models/components/costmetadatainput.js";

export type IngestionContext<
  TContext extends Record<string, EventMetadataInput> = Record<
    string,
    EventMetadataInput
  >
> = TContext;

type Transformer<TContext extends IngestionContext> = (
  ctx: TContext,
  customer: IngestionStrategyCustomer | IngestionStrategyExternalCustomer
) => Promise<void>;

export type Span = {
  name: string;
  startTime: number;
  endTime: number;
};

export class PagoIngestion<TContext extends IngestionContext> {
  public pagoClient?: Pago;
  private transformers: Transformer<TContext>[] = [];
  public costResolver?: (ctx: TContext) => CostMetadataInput;
  public span?: Span;

  private pipe(transformer: Transformer<TContext>) {
    this.transformers.push(transformer);

    return this;
  }

  public async execute(
    ctx: TContext,
    customer: IngestionStrategyCustomer | IngestionStrategyExternalCustomer
  ) {
    await Promise.all(
      this.transformers.map((transformer) => transformer(ctx, customer))
    );
  }

  public schedule(
    meter: string,
    metadataResolver?: (ctx: TContext) => Record<string, EventMetadataInput>
  ) {
    return this.pipe(async (ctx, customer) => {
      if (!this.pagoClient) {
        throw new Error("Pago client not initialized");
      }

      await this.pagoClient.events.ingest({
        events: [
          {
            ...customer,
            name: meter,
            metadata: {
              ...(metadataResolver ? metadataResolver(ctx) : ctx),
              ...(this.costResolver ? { _cost: this.costResolver(ctx) } : {}),
            },
          },
        ],
      });
    });
  }
}

export function Ingestion(pagoConfig?: SDKOptions) {
  return {
    strategy: <TContext extends IngestionStrategyContext, TStrategyClient>(
      strategy: IngestionStrategy<TContext, TStrategyClient>
    ) => {
      strategy.pagoClient = new Pago(pagoConfig);
      return strategy;
    },
    ingest: async (events: (EventCreateCustomer | EventCreateCustomer)[]) => {
      const pago = new Pago(pagoConfig);

      return pago.events.ingest({
        events,
      });
    },
  };
}

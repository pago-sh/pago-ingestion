# @pago-sh/ingestion

Este framework de ingestao oferece um SDK robusto para trabalhar com a API de ingestao de eventos da pago.sh.

## Ingestao basica

Para fazer a ingestao basica, voce pode usar a funcao Ingestion diretamente.

```typescript
import { Ingestion } from "@pago-sh/ingestion";

await Ingestion({
  accessToken: process.env.PAGO_ACCESS_TOKEN,
}).ingest([
  // Ingestao usando o Customer ID da pago.sh
  {
    name: "<value>",
    customerId: "<value>",
    metadata: {
      myProp: "value",
    },
  },
  // Ingestao usando o Customer ID externo do seu banco de dados
  {
    name: "<value>",
    externalCustomerId: "<id>",
    metadata: {
      myProp: "value",
    },
  },
]);
```

Ou voce pode usar a Event API do SDK da pago.sh.

```typescript
import { Pago } from "@pago-sh/sdk";

const pago = new Pago({
  accessToken: process.env["PAGO_ACCESS_TOKEN"] ?? "",
});

await pago.events.ingest({
  events: [
    // Ingestao usando o Customer ID da pago.sh
    {
      name: "<value>",
      customerId: "<value>",
      metadata: {
        myProp: "value",
      },
    },
    // Ingestao usando o Customer ID externo do seu banco de dados
    {
      name: "<value>",
      externalCustomerId: "<id>",
      metadata: {
        myProp: "value",
      },
    },
  ],
});
```

### Associando custos a eventos

Com a API de ingestao de eventos da pago.sh, voce pode anotar custos arbitrarios nos eventos. Isso libera a possibilidade de visualizar custos por cliente, margens e fluxo de caixa no seu Dashboard da pago.sh.

Isso e especialmente poderoso com chamadas a LLMs, ja que o consumo de tokens normalmente acarreta um custo para o seu negocio.

[Saiba mais sobre a ingestao de custos](https://pago.sh/docs/features/cost-insights/cost-events)

```typescript
import { Pago } from "@pago-sh/sdk";

const pago = new Pago({
  accessToken: process.env["PAGO_ACCESS_TOKEN"] ?? "",
});

await pago.events.ingest({
  events: [
    // Ingestao usando o Customer ID da pago.sh
    {
      name: "<value>",
      customerId: "<value>",
      metadata: {
        myProp: "<value>",
        _cost: {
          amount: 100, // O valor deve estar em centavos. $1.23 deve ser representado como 123
          currency: "usd",
        },
      },
    },
  ],
});
```

## Estrategias

Quer reportar eventos relacionados ao uso de Large Language Models, uploads de arquivos no S3 ou algo mais? Nossas estrategias de ingestao sao personalizadas para tornar o disparo de eventos de ingestao o mais simples possivel, mesmo para necessidades complexas.

### Estrategia LLM

Envolva qualquer modelo de LLM da biblioteca `@ai-sdk/*` para disparar automaticamente os tokens de prompt e de completion usados a cada chamada do modelo.

```
pnpm add @pago-sh/ingestion ai @ai-sdk/openai
```

```typescript
import { Ingestion } from "@pago-sh/ingestion";
import { LLMStrategy } from "@pago-sh/ingestion/strategies/LLM";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

/**
 * Configurando a estrategia de ingestao LLM
 *
 * 1. Inicializamos o objeto Ingestion com um Access Token da pago.sh
 * 2. Anexamos a estrategia LLM a instancia de ingestao
 * 3. (Opcional) - Podemos calcular um custo para a chamada do LLM e associa-lo ao evento
 * 4. Por fim, declaramos qual nome o evento ingerido deve ter
 */
const llmIngestion = Ingestion({ accessToken: process.env.PAGO_ACCESS_TOKEN })
  .strategy(new LLMStrategy(openai("gpt-4o")))
  .cost((ctx) => ({ amount: ctx.totalTokens * 100, currency: "USD" }))
  .ingest("openai-usage");

export async function POST(req: Request) {
  const { prompt }: { prompt: string } = await req.json();

  // Obtenha o modelo de LLM encapsulado com capacidades de ingestao
  // Passe o Customer Id para anotar corretamente os eventos de ingestao com um cliente especifico
  const model = llmIngestion.client({
    customerId: request.headers.get("X-Pago-Customer-Id") ?? "",
  });

  const { text } = await generateText({
    model,
    system: "You are a helpful assistant.",
    prompt,
  });

  return Response.json({ text });
}
```

#### Payload de ingestao

```json
{
  "customerId": "123",
  "name": "openai-usage",
  "metadata": {
    "inputTokens": 100,
    "cachedInputTokens": 10,
    "outputTokens": 200,
    "totalTokens": 300,
    "model": "gpt-4o",
    "provider": "openai.responses",
    "strategy": "LLM",
    "_cost": {
      "amount": 123, // O valor deve estar em centavos. $1.23 deve ser representado como 123
      "currency": "usd"
    },
    "_llm": {
      ... //
    }
  }
}
```

### Estrategia S3

Envolva o AWS S3 Client oficial com nossa estrategia de ingestao S3 para ingerir automaticamente os bytes enviados.

```
pnpm add @pago-sh/ingestion @aws-sdk/client-s3
```

```typescript
import { Ingestion } from "@pago-sh/ingestion";
import { S3Strategy } from "@pago-sh/ingestion/strategies/S3";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT_URL,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Configurando a estrategia de ingestao S3
const s3Ingestion = Ingestion({ accessToken: process.env.PAGO_ACCESS_TOKEN })
  .strategy(new S3Strategy(s3Client))
  .ingest("s3-uploads");

export async function POST(request: Request) {
  try {
    // Obtenha o S3 Client encapsulado
    // Passe o Customer Id para anotar corretamente os eventos de ingestao com um cliente especifico
    const s3 = s3Ingestion.client({
      customerId: request.headers.get("X-Pago-Customer-Id") ?? "",
    });

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: "a-random-key",
        Body: JSON.stringify({
          name: "John Doe",
          age: 30,
        }),
        ContentType: "application/json",
      })
    );

    return Response.json({});
  } catch (error) {
    return Response.json({ error: error.message });
  }
}
```

#### Payload de ingestao

```json
{
  "customerId": "123",
  "name": "s3-uploads",
  "metadata": {
    "bytes": 100,
    "bucket": "my-bucket",
    "key": "my-key",
    "contentType": "application/text",
    "strategy": "S3"
  }
}
```

### Estrategia Stream

Envolva qualquer stream Readable ou Writable de sua escolha para ingerir automaticamente os bytes consumidos.

```
pnpm add @pago-sh/ingestion
```

```typescript
import { Ingestion } from '@pago-sh/ingestion';
import { StreamStrategy } from '@pago-sh/ingestion/strategies/Stream';

const myReadstream = createReadStream(...);

// Configurando a estrategia de ingestao Stream
const streamIngestion = Ingestion({ accessToken: process.env.PAGO_ACCESS_TOKEN })
  .strategy(new StreamStrategy(myReadstream))
  .ingest("my-stream");

export async function GET(request: Request) {
  try {

    // Obtenha o stream encapsulado
    // Passe o Customer Id para anotar corretamente os eventos de ingestao com um cliente especifico
    const stream = streamIngestion.client({
      customerId: request.headers.get("X-Pago-Customer-Id") ?? ""
    });

    // Consuma o stream...
    stream.on('data', () => ...)

    return Response.json({});
  } catch (error) {
    return Response.json({ error: error.message });
  }
}
```

#### Payload de ingestao

```json
{
  "customerId": "123",
  "name": "my-stream",
  "metadata": {
    "bytes": 100,
    "strategy": "Stream"
  }
}
```

### Estrategia DeltaTime

Faca a ingestao do delta de tempo de uma execucao arbitraria. Traga o seu proprio now-resolver.

```
pnpm add @pago-sh/ingestion
```

```typescript
import { Ingestion } from "@pago-sh/ingestion";
import { DeltaTimeStrategy } from "@pago-sh/ingestion/strategies/DeltaTime";

const nowResolver = () => performance.now();
// const nowResolver = () => Number(hrtime.bigint())
// const nowResolver = () => Date.now()

// Configurando a estrategia de ingestao Delta Time
const deltaTimeIngestion = Ingestion({
  accessToken: process.env.PAGO_ACCESS_TOKEN,
})
  .strategy(new DeltaTimeStrategy(nowResolver))
  .ingest("execution-time");

export async function GET(request: Request) {
  try {
    // Obtenha a funcao encapsulada que inicia o cronometro
    // Passe o Customer Id para anotar corretamente os eventos de ingestao com um cliente especifico
    const start = deltaTimeIngestion.client({
      customerId: request.headers.get("X-Pago-Customer-Id") ?? "",
    });

    const stop = start();

    await sleep(1000);

    // { deltaTime: xxx } e ingerido automaticamente na pago.sh
    const delta = stop();

    return Response.json({ delta });
  } catch (error) {
    return Response.json({ error: error.message });
  }
}
```

#### Payload de ingestao

```json
{
  "customerId": "123",
  "name": "execution-time",
  "metadata": {
    "deltaTime": 1000,
    "strategy": "DeltaTime"
  }
}
```

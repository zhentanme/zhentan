import { Router, Request, Response, type IRouter } from "express";
import { createPublicClient, http, isAddress } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";

export function createResolveRouter(): IRouter {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const name = (req.query.name as string | undefined)?.trim();
      if (!name) {
        res.status(400).json({ error: "Missing name" });
        return;
      }

      if (name.startsWith("0x") && name.length === 42 && isAddress(name)) {
        res.json({ address: name });
        return;
      }

      const client = createPublicClient({
        chain: mainnet,
        transport: http(),
      });

      const address = await client.getEnsAddress({
        name: normalize(name),
      });

      if (!address) {
        res.status(404).json({ error: "Name not found" });
        return;
      }

      res.json({ address });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Resolve failed";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

import { Router } from "express";
import { autenticar, soloAdministradora } from "../middleware/auth.js";
import { resumen } from "../controllers/dashboard.controller.js";

const router = Router();
router.use(autenticar, soloAdministradora);

router.get("/", resumen);

export default router;

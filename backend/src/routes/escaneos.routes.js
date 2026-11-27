import { Router } from "express";
import { autenticar } from "../middleware/auth.js";
import { crear, detalleUsuario, detalleUsuarioZonaCtrl, eliminar, novedades, recientes, resumen } from "../controllers/escaneos.controller.js";

const router = Router();
router.use(autenticar);

router.post("/", crear);
router.get("/recientes", recientes);
router.get("/resumen-mio", resumen);
router.get("/novedades", novedades);
router.get("/usuario", detalleUsuario);
router.get("/usuario-zona", detalleUsuarioZonaCtrl);
router.delete("/:id", eliminar);

export default router;

import { Router } from "express";
import { autenticar, soloAdministradora } from "../middleware/auth.js";
import { crear, detalleUsuario, detalleUsuarioZonaCtrl, detalleZonaCtrl, eliminar, novedades, recientes, resumen, resumenZonaCtrl } from "../controllers/escaneos.controller.js";

const router = Router();
router.use(autenticar);

router.post("/", crear);
router.get("/recientes", recientes);
router.get("/resumen-mio", resumen);
router.get("/novedades", novedades);
router.get("/usuario", detalleUsuario);
router.get("/zona", soloAdministradora, detalleZonaCtrl);
router.get("/zona-resumen", soloAdministradora, resumenZonaCtrl);
router.delete("/:id", eliminar);

export default router;

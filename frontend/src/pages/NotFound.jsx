import { PackageSearch } from 'lucide-react';
import Card from '../components/Card.jsx';
import Empty from '../components/Empty.jsx';

function NotFound(){return <Card><Empty icon={PackageSearch} title="Página no encontrada" text="Usa el menú para volver a una sección del sistema."/></Card>}

export default NotFound;

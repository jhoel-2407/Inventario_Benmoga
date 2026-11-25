import Card from './Card.jsx';

function Stat({ icon: Icon, label, value, sub }) { return <Card className="stat"><div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={19}/></span></div><div className="stat-value">{value ?? '—'}</div>{sub && <div className="stat-sub">{sub}</div>}</Card>; }

export default Stat;

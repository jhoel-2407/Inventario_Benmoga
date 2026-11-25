function Empty({ icon: Icon, title, text }) { return <div className="empty-state"><div><Icon size={25}/></div><b>{title}</b><p>{text}</p></div>; }

export default Empty;

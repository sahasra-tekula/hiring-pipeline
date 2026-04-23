function SectionCard({ eyebrow, title, description, children }) {
  return (
    <section className="section-card">
      <div className="section-card-header">
        <p className="section-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {description ? <p className="section-description">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default SectionCard;
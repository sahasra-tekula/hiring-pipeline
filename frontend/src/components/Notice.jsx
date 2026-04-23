function Notice({ tone = "info", children }) {
  if (!children) {
    return null;
  }

  return <div className={`notice notice-${tone}`}>{children}</div>;
}

export default Notice;
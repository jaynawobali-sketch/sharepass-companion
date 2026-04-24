function Error({ statusCode }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px',
      fontFamily: 'Onest, sans-serif',
      background: '#0c0e16',
      color: '#e8e4dc',
      textAlign: 'center'
    }}>
      <div style={{
        fontSize: '4rem',
        marginBottom: '1rem',
        color: '#c47a7a'
      }}>
        {statusCode || 'Error'}
      </div>
      <h1 style={{
        fontSize: '1.5rem',
        marginBottom: '1rem',
        fontWeight: '500'
      }}>
        Something went wrong
      </h1>
      <p style={{
        fontSize: '1rem',
        color: '#8a8fa8',
        marginBottom: '2rem',
        maxWidth: '400px'
      }}>
        {statusCode
          ? `An error ${statusCode} occurred on server`
          : 'An error occurred on client'
        }
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: '12px 24px',
          background: '#c4a882',
          color: '#0c0e16',
          border: 'none',
          borderRadius: '8px',
          fontSize: '1rem',
          fontWeight: '500',
          cursor: 'pointer',
          transition: 'background 0.2s'
        }}
        onMouseOver={(e) => e.target.style.background = '#b89a72'}
        onMouseOut={(e) => e.target.style.background = '#c4a882'}
      >
        Try Again
      </button>
    </div>
  );
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;

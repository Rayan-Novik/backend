const errorHandler = (err, req, res, next) => {
    console.error(`🚨 [Erro ${req.method} ${req.originalUrl}]:`, err.message);
    if (!(err instanceof SyntaxError)) {
        console.error(err.stack);
    }

    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
    res.status(statusCode);
    res.json({
        message: err.message,
        // Em desenvolvimento, é útil ver o stack trace
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack,
    });
};

export default errorHandler;
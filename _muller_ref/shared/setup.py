from setuptools import setup, find_packages

setup(
    name="manhwa-shared",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "sqlalchemy>=2.0",
        "asyncpg",
        "redis>=5.0",
        "argon2-cffi",
        "python-jose[cryptography]",
        "httpx",
        "pydantic>=2.0",
        "pydantic-settings",
    ],
)

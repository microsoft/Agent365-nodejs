# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the Kairo repository.

## CI Workflow (ci.yml)

The main CI workflow builds, tests, and prepares all three SDK packages for publishing:

### Jobs

#### Python SDK (`python-sdk`)
- **Matrix**: Python 3.11 and 3.12
- **Steps**:
  - Install dependencies and build tools
  - Optional linting with ruff
  - Build Python package using `python -m build`
  - Run tests with pytest
  - *Publishing to PyPI (commented out for now)*

#### JavaScript/Node.js SDK (`javascript-sdk`)
- **Matrix**: Node.js 18 and 20
- **Steps**:
  - Install npm dependencies
  - Run ESLint for code quality
  - Build TypeScript to JavaScript
  - Run Jest tests
  - *Publishing to NPM (commented out for now)*

#### .NET SDK (`dotnet-sdk`)
- **Matrix**: .NET 8.0.x
- **Steps**:
  - Restore NuGet dependencies
  - Build solution in Release configuration
  - Run unit tests
  - Pack NuGet packages
  - Upload packages as artifacts
  - *Publishing to NuGet (commented out for now)*

### Triggers

- **Push**: Triggers on pushes to `main` or `master` branches
- **Pull Request**: Triggers on pull requests targeting `main` or `master` branches

### Publishing

All publishing steps are currently commented out as requested. To enable publishing:

1. **Python**: Uncomment the PyPI publishing step and add `PYPI_API_TOKEN` secret
2. **JavaScript**: Uncomment the NPM publishing step and add `NPM_TOKEN` secret  
3. **.NET**: Uncomment the NuGet publishing step and add `NUGET_API_KEY` secret

### Caching

The workflow uses dependency caching to speed up builds:
- Python: pip cache
- JavaScript: npm cache
- .NET: NuGet packages are cached automatically by the dotnet CLI

## 📋 Telemetry

Data Collection. The software may collect information about you and your use of the software and send it to Microsoft. Microsoft may use this information to provide services and improve our products and services. You may turn off the telemetry as described in the repository. There are also some features in the software that may enable you and Microsoft to collect data from users of your applications. If you use these features, you must comply with applicable law, including providing appropriate notices to users of your applications together with a copy of Microsoft's privacy statement. Our privacy statement is located at https://go.microsoft.com/fwlink/?LinkID=824704. You can learn more about data collection and use in the help documentation and our privacy statement. Your use of the software operates as your consent to these practices.

## Trademarks

*Microsoft, Windows, Microsoft Azure and/or other Microsoft products and services referenced in the documentation may be either trademarks or registered trademarks of Microsoft in the United States and/or other countries. The licenses for this project do not grant you rights to use any Microsoft names, logos, or trademarks. Microsoft's general trademark guidelines can be found at http://go.microsoft.com/fwlink/?LinkID=254653.*

## License

Copyright (c) Microsoft Corporation. All rights reserved.

Licensed under the MIT License - see the [LICENSE](../../LICENSE.md) file for details.

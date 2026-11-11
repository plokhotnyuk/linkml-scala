package eu.neverblink.ohi.cli

import eu.neverblink.ohi.model.generated.CliFileError

private[cli] final class CliFileException(
    val error: CliFileError,
    cause: Option[Throwable] = None,
) extends RuntimeException(error.message, cause.orNull)

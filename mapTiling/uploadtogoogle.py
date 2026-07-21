import random


def delete_extra_files(bucket_name, prefix, local_files, source_directory):
    """
    Delete blobs from the bucket under `prefix` that are not present in `local_files`.

    Args:
        bucket_name: GCS bucket name.
        prefix: The cloud prefix (e.g., "tilesLQ/").
        local_files: List of local file paths relative to source_directory.
        source_directory: The local root directory (used only for relative path logic).
    """
    from google.cloud.storage import Client

    storage_client = Client()
    bucket = storage_client.bucket(bucket_name)

    # Build a set of local relative paths for fast lookup
    # We need the local relative paths as they would appear in the cloud blob name.
    # Since your upload adds a prefix, the cloud blob name = prefix + local_relative_path
    local_set = set(local_files)  # local_files already relative to source_directory

    # List all blobs under the prefix
    print(f"Listing blobs under '{prefix}'...")
    blobs = list(bucket.list_blobs(prefix=prefix))
    print(f"Found {len(blobs)} blobs in the cloud.")

    # Find blobs that are not in local_set
    extra_blobs = []
    for blob in blobs:
        # Remove the prefix to get the relative path
        # blob.name starts with "tilesLQ/", so we strip it
        if not blob.name.startswith(prefix):
            continue
        relative_name = blob.name[len(prefix) :]
        if relative_name not in local_set:
            extra_blobs.append(blob)

    if not extra_blobs:
        print("No extra files to delete.")
        return

    for x in range(min(10, len(extra_blobs))):
        print("{}".format(random.choice(extra_blobs)))

    input("Press Enter to continue...")

    print(f"Deleting {len(extra_blobs)} extra files...")

    # Delete in batches of 100 (GCS API limit for batch deletion)
    batch_size = 100
    for i in range(0, len(extra_blobs), batch_size):
        batch = extra_blobs[i : i + batch_size]
        # delete_blobs returns a list of errors
        bucket.delete_blobs(batch)
        print("deleted", len(batch), "remaining:", len(extra_blobs) - (i + batch_size))

    print("Cleanup complete.")


def upload_directory_with_transfer_manager(
    bucket_name, source_directory, prefix, workers=8
):
    """Upload every file in a directory, including all files in subdirectories.

    Each blob name is derived from the filename, not including the `directory`
    parameter itself. For complete control of the blob name for each file (and
    other aspects of individual blob metadata), use
    transfer_manager.upload_many() instead.
    """

    # The ID of your GCS bucket
    # bucket_name = "your-bucket-name"

    # The directory on your computer to upload. Files in the directory and its
    # subdirectories will be uploaded. An empty string means "the current
    # working directory".
    # source_directory=""

    # The maximum number of processes to use for the operation. The performance
    # impact of this value depends on the use case, but smaller files usually
    # benefit from a higher number of processes. Each additional process occupies
    # some CPU and memory resources until finished. Threads can be used instead
    # of processes by passing `worker_type=transfer_manager.THREAD`.
    # workers=8

    from pathlib import Path

    from google.cloud.storage import Client, transfer_manager

    print("Connecting to Google Cloud Storage...")
    storage_client = Client()
    bucket = storage_client.bucket(bucket_name)

    # Generate a list of paths (in string form) relative to the `directory`.
    # This can be done in a single list comprehension, but is expanded into
    # multiple lines here for clarity.

    # First, recursively get all files in `directory` as Path objects.
    print("Finding files...")
    directory_as_path_obj = Path(source_directory)
    paths = directory_as_path_obj.rglob("*")

    # Filter so the list only includes files, not directories themselves.
    file_paths = [path for path in paths if path.is_file()]

    # These paths are relative to the current working directory. Next, make them
    # relative to `directory`
    relative_paths = [
        path.relative_to(source_directory).as_posix() for path in file_paths
    ]

    # Finally, convert them all to strings.
    string_paths = [str(path) for path in relative_paths]

    print("Found {} files.".format(len(string_paths)))

    filebatchSize = 10000
    batches = []
    for i in range(0, len(string_paths), filebatchSize):
        batches.append(string_paths[i : i + filebatchSize])

    for x in range(5):
        print("{}".format(random.choice(random.choice(batches))))
    input("Press Enter to continue...")

    # Start the upload.
    for i, batch in enumerate(batches):
        results = transfer_manager.upload_many_from_filenames(
            bucket,
            batch,
            source_directory=source_directory,
            max_workers=workers,
            blob_name_prefix=prefix,
            skip_if_exists=False,
        )

        for name, result in zip(batch, results):
            # The results list is either `None` or an exception for each filename in
            # the input list, in order.

            if isinstance(result, Exception):
                print("Failed to upload {} due to exception: {}".format(name, result))
            else:
                if result is not None:
                    print("Failed to upload {} with error: {}".format(name, result))
                print("Uploaded {} to {}.".format(name, bucket.name))
        print("Batch {} of {} complete.".format(i + 1, len(batches)))
    print("Upload complete.")


if __name__ == "__main__":
    # You can pass the same arguments as before
    bucket_name = "raumplan.flulu.de"
    source_directory = "tiles/"
    prefix = "tilesLQ/"
    workers = 20

    # 1) Build the local file list (same as in upload function)
    from pathlib import Path

    paths = Path(source_directory).rglob("*")
    file_paths = [path for path in paths if path.is_file()]
    relative_paths = [
        path.relative_to(source_directory).as_posix() for path in file_paths
    ]
    local_files = [str(path) for path in relative_paths]
    print(f"Found {len(local_files)} local files.")

    # 2) Upload
    upload_directory_with_transfer_manager(
        bucket_name, source_directory, prefix, workers
    )

    # 3) Delete extra files
    delete_extra_files(bucket_name, prefix, local_files, source_directory)

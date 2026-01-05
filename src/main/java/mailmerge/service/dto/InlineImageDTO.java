package mailmerge.service.dto;

public class InlineImageDTO {
    private String cid;
    private String name;
    private String fileContentType;
    private byte[] file;

    public String getCid() { return cid; }
    public void setCid(String cid) { this.cid = cid; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getFileContentType() { return fileContentType; }
    public void setFileContentType(String fileContentType) { this.fileContentType = fileContentType; }

    public byte[] getFile() { return file; }
    public void setFile(byte[] file) { this.file = file; }
}

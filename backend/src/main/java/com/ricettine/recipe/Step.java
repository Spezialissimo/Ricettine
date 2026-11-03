package com.ricettine.recipe;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "step")
public class Step {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;
	private int position;
	private String text;
	@Column(name = "photo_media_id")
	private String photoMediaId;

	protected Step() {
	}

	public Step(int position, String text, String photoMediaId) {
		this.position = position;
		this.text = text;
		this.photoMediaId = photoMediaId;
	}

	public int getPosition() { return position; }
	public String getText() { return text; }
	public String getPhotoMediaId() { return photoMediaId; }
}

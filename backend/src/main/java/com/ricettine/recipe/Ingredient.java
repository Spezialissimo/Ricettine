package com.ricettine.recipe;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "ingredient")
public class Ingredient {

	@Id
	@GeneratedValue(strategy = GenerationType.UUID)
	private UUID id;
	private int position;
	private BigDecimal amount;
	private String unit;
	private String name;
	private String note;

	protected Ingredient() {
	}

	public Ingredient(int position, BigDecimal amount, String unit, String name, String note) {
		this.position = position;
		this.amount = amount;
		this.unit = unit;
		this.name = name;
		this.note = note;
	}

	public int getPosition() { return position; }
	public BigDecimal getAmount() { return amount; }
	public String getUnit() { return unit; }
	public String getName() { return name; }
	public String getNote() { return note; }
}
